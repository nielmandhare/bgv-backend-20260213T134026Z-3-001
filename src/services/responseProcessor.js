const idfyMapping = require("./vendorMappings/idfyMapping");

/**
 * ResponseProcessor
 *
 * Takes a raw IDfy API response, extracts fields using the vendor mapping,
 * determines whether the document was found, and returns a clean standardised
 * object that gets stored in verification_results.result_data.
 *
 * Usage:
 *   const processed = responseProcessor.process('idfy', rawResponse, 'pan');
 *
 * ─── Returned shape ──────────────────────────────────────────────────────────
 * {
 *   request_id:        string,
 *   vendor:            'idfy',
 *   verification_type: 'pan' | 'aadhaar' | 'gst',
 *   status:            'success' | 'failed' | 'timeout' | 'in_progress',
 *   verified:          boolean,
 *   result:            object,       // extracted + transformed fields
 *   raw_response:      object,       // full original IDfy payload (audit trail)
 *   processed_at:      ISO string    // JS timestamp — DB also records NOW()
 * }
 *
 * ─── status vs verified — critical distinction (BE-9) ───────────────────────
 *
 *   status   tracks whether the IDfy API call itself succeeded or failed.
 *            'success'    — IDfy processed the request correctly.
 *                           This includes the case where the document was NOT
 *                           found — that is still a successful API interaction.
 *            'failed'     — IDfy returned an error or the task itself failed.
 *            'timeout'    — IDfy was too slow / polling timed out.
 *            'in_progress'— IDfy is still processing (async flow only).
 *
 *   verified tracks whether the document was confirmed in the govt database.
 *            true  — document found (id_found)
 *            false — document not found (id_not_found) OR API failed
 *
 * Example: a valid PAN not registered in NSDL →
 *   status = 'success'  (API worked perfectly)
 *   verified = false    (the document doesn't exist in govt DB)
 *
 * This distinction is critical for BE-9 status tracking — if we mapped
 * id_not_found to api_status='failed' it would look like an API outage.
 */
class ResponseProcessor {
  constructor() {
    // Vendor mapping registry — add new vendors here when onboarding them
    this.vendors = {
      idfy: idfyMapping,
    };
  }

  /**
   * Main entry point.
   *
   * Never throws — always returns a valid object. If anything goes wrong
   * internally, it returns a failure-shape with the error captured so the
   * controller can still write something to the DB.
   *
   * @param {string} vendor           - 'idfy'
   * @param {object} rawResponse      - Raw JSON from the vendor API
   * @param {string} verificationType - 'pan' | 'aadhaar' | 'gst'
   * @returns {object} Standardised result object
   */
  process(vendor, rawResponse, verificationType) {
    try {
      console.log(`[ResponseProcessor] Processing ${vendor}/${verificationType}`);

      if (!rawResponse) {
        throw new Error(`Empty response from ${vendor} for ${verificationType}`);
      }

      const mapping = this.vendors[vendor.toLowerCase()];
      if (!mapping) {
        throw new Error(`Unknown vendor: ${vendor}`);
      }

      const typeMapping = mapping[verificationType];
      if (!typeMapping) {
        throw new Error(`No mapping for ${verificationType} under vendor ${vendor}`);
      }

      // Step 1 — Extract fields from the raw response using dot-notation paths
      const extracted = this._extractData(rawResponse, typeMapping);

      // Step 2 — Determine if the document was actually found in the govt DB
      const verified = this._isVerified(extracted, typeMapping, rawResponse);

      // Step 3 — Map IDfy's top-level task status to our internal api_status
      //          This is separate from verified — see the comment block above.
      const status = this._mapStatus(rawResponse.status, verified);

      const standardised = {
        request_id:        rawResponse.request_id || rawResponse.id || "unknown",
        vendor,
        verification_type: verificationType,
        status,
        verified,
        result:            extracted,
        raw_response:      rawResponse, // full payload kept for audit trail
        processed_at:      new Date().toISOString(),
      };

      console.log(
        `[ResponseProcessor] Done — status=${standardised.status}, verified=${verified}`
      );
      return standardised;

    } catch (error) {
      console.error("[ResponseProcessor] Failed:", error.message);

      // Return a safe failure shape — never throw to the controller.
      // The controller's setFailed() will still write the failure_reason.
      return {
        request_id:        rawResponse?.request_id || "unknown",
        vendor,
        verification_type: verificationType,
        status:            "failed",
        verified:          false,
        error:             error.message,
        raw_response:      rawResponse,
        processed_at:      new Date().toISOString(),
      };
    }
  }

  /**
   * Walk the field map and pull values out using dot-notation paths.
   * Runs the mapping's transform() function if defined.
   *
   * @private
   */
  _extractData(rawResponse, mapping) {
    const extracted = {};

    for (const [targetField, sourcePath] of Object.entries(mapping.fields)) {
      const value = this._getValueByPath(rawResponse, sourcePath);
      if (value !== undefined && value !== null) {
        extracted[targetField] = value;
      }
    }

    // transform() does post-extract cleanup: boolean coercions, field renames,
    // adding computed fields like aadhaar_linked, gstin_active, name_matched.
    if (typeof mapping.transform === "function") {
      return mapping.transform(extracted, rawResponse);
    }

    return extracted;
  }

  /**
   * Resolve a dot-notation path against a nested object.
   * e.g. _getValueByPath(obj, 'result.source_output.pan_number')
   *
   * Returns undefined (not null) when the path doesn't exist so that the
   * caller can distinguish "field is present and null" from "field not present".
   *
   * @private
   */
  _getValueByPath(obj, path) {
    if (!obj || !path) return undefined;
    return path.split(".").reduce((current, key) => {
      return current !== null && current !== undefined
        ? current[key]
        : undefined;
    }, obj);
  }

  /**
   * Map IDfy's top-level task status string to our internal api_status value.
   *
   * Key rule (BE-9):
   *   IDfy 'completed' ALWAYS maps to our 'success' regardless of verified.
   *   'completed' means IDfy processed the request — even id_not_found is a
   *   successful, complete API response.
   *
   *   Only 'failed'/'error' from IDfy maps to our 'failed', which represents
   *   an actual API-level problem (network, auth, bad request, source_down, etc.)
   *
   * @private
   */
  _mapStatus(vendorStatus, verified) {
    const statusMap = {
      completed:   "success",
      success:     "success",
      failed:      "failed",
      error:       "failed",
      timeout:     "timeout",
      pending:     "in_progress",
      in_progress: "in_progress",
    };

    const normalised = vendorStatus?.toLowerCase();
    if (normalised && normalised in statusMap) {
      return statusMap[normalised];
    }

    // Fallback: if IDfy gave us an unrecognised status string, infer from
    // whether we got a verified result. This handles any edge cases from
    // new IDfy response variants we haven't seen yet.
    console.warn(
      `[ResponseProcessor] Unrecognised vendor status: "${vendorStatus}" — inferring from verified=${verified}`
    );
    return verified ? "success" : "failed";
  }

  /**
   * Determine whether the verification should be marked as verified=true.
   *
   * Two conditions must both be true:
   *   1. All required fields are present in the extracted result.
   *   2. The successIndicator path in the raw response equals its expected value.
   *
   * For PAN:    successIndicator = result.source_output.status === 'id_found'
   * For Aadhaar: same path, same value
   * For GSTIN:   same path, same value
   *
   * id_not_found passes condition 1 (fields present) but fails condition 2
   * (status is 'id_not_found' not 'id_found'), so verified=false correctly.
   *
   * @private
   */
  _isVerified(extracted, mapping, rawResponse) {
    // Check required fields
    const required    = mapping.required || [];
    const hasRequired = required.every(
      (field) => extracted[field] !== undefined && extracted[field] !== null
    );
    if (!hasRequired) {
      console.log("[ResponseProcessor] isVerified=false — missing required fields");
      return false;
    }

    // Check the successIndicator
    if (mapping.successIndicator) {
      const actual   = this._getValueByPath(rawResponse, mapping.successIndicator.path);
      const expected = mapping.successIndicator.value;
      const match    = actual === expected;
      console.log(
        `[ResponseProcessor] successIndicator check: ` +
        `path="${mapping.successIndicator.path}", expected="${expected}", actual="${actual}" → ${match}`
      );
      return match;
    }

    // No explicit successIndicator defined — fall back to checking the
    // top-level task status isn't a known failure state.
    const topStatus = rawResponse.status?.toLowerCase();
    return !rawResponse.error && topStatus !== "failed" && topStatus !== "error";
  }
}

module.exports = new ResponseProcessor();