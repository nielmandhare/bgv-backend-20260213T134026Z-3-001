const idfyMapping = require('./vendorMappings/idfyMapping');

/**
 * ResponseProcessor
 *
 * Takes a raw IDfy API response, extracts fields using the
 * vendor mapping, validates required fields, and returns a
 * clean standardised object that gets stored in the DB.
 *
 * Usage:
 *   const processed = responseProcessor.process('idfy', rawResponse, 'pan');
 *
 * ─── Returned shape ───────────────────────────────────────────────────────────
 * {
 *   request_id:        string,
 *   vendor:            'idfy',
 *   verification_type: 'pan' | 'aadhaar' | 'gst',
 *   status:            'success' | 'failed' | 'timeout' | 'in_progress',
 *   verified:          boolean,   // true = document confirmed found in govt DB
 *   result:            object,    // extracted + transformed fields
 *   raw_response:      object,    // original IDfy payload (audit trail)
 *   processed_at:      ISO string
 * }
 *
 * ─── status vs verified ───────────────────────────────────────────────────────
 *   status   = did the IDfy API call itself succeed?
 *              'success' means IDfy responded correctly (even if PAN not found)
 *              'failed'  means IDfy errored or the task failed
 *
 *   verified = did the document pass the govt database lookup?
 *              true  = id_found  (PAN exists in NSDL)
 *              false = id_not_found (PAN doesn't exist — not an API error)
 */
class ResponseProcessor {
  constructor() {
    this.vendors = {
      idfy: idfyMapping,
    };
  }

  /**
   * Main entry point.
   * @param {string} vendor           - 'idfy'
   * @param {object} rawResponse      - Raw JSON from the vendor API
   * @param {string} verificationType - 'pan' | 'aadhaar' | 'gst'
   * @returns {object} Standardised result object
   */
  process(vendor, rawResponse, verificationType) {
    try {
      console.log(`[ResponseProcessor] Processing ${vendor}/${verificationType}`);

      const mapping = this.vendors[vendor.toLowerCase()];
      if (!mapping) {
        throw new Error(`Unknown vendor: ${vendor}`);
      }

      const typeMapping = mapping[verificationType];
      if (!typeMapping) {
        throw new Error(`No mapping for ${verificationType} under vendor ${vendor}`);
      }

      // Step 1 — Pull fields out of the raw response
      const extracted = this.extractData(rawResponse, typeMapping);

      // Step 2 — Check required fields + successIndicator
      const verified = this.isVerified(extracted, typeMapping, rawResponse);

      // Step 3 — Build the standardised response stored in DB
      const standardised = {
        request_id:        rawResponse.request_id || rawResponse.id || 'unknown',
        vendor,
        verification_type: verificationType,
        status:            this.mapStatus(rawResponse.status, verified),
        verified,
        result:            extracted,
        raw_response:      rawResponse,   // kept for audit trail
        processed_at:      new Date().toISOString(),
      };

      console.log(`[ResponseProcessor] Done — status=${standardised.status}, verified=${verified}`);
      return standardised;

    } catch (error) {
      console.error('[ResponseProcessor] Failed:', error.message);

      // Always return a shape — never throw up to the controller
      return {
        request_id:        rawResponse?.request_id || 'unknown',
        vendor,
        verification_type: verificationType,
        status:            'failed',
        verified:          false,
        error:             error.message,
        raw_response:      rawResponse,
        processed_at:      new Date().toISOString(),
      };
    }
  }

  /**
   * Walk the field map and pull values out using dot-notation paths.
   */
  extractData(rawResponse, mapping) {
    const extracted = {};

    for (const [targetField, sourcePath] of Object.entries(mapping.fields)) {
      const value = this.getValueByPath(rawResponse, sourcePath);
      if (value !== undefined && value !== null) {
        extracted[targetField] = value;
      }
    }

    // Run the mapping's transform() if defined
    if (typeof mapping.transform === 'function') {
      return mapping.transform(extracted, rawResponse);
    }

    return extracted;
  }

  /**
   * Resolve a dot-notation path against a nested object.
   * e.g. getValueByPath(obj, 'result.source_output.pan_number')
   */
  getValueByPath(obj, path) {
    if (!obj || !path) return undefined;
    return path.split('.').reduce((current, key) => {
      return current !== null && current !== undefined
        ? current[key]
        : undefined;
    }, obj);
  }

  /**
   * Map the IDfy top-level task status to our internal api_status.
   *
   * Key distinction:
   *   'completed' → 'success' ALWAYS — IDfy processed the request correctly.
   *                 A PAN returning id_not_found is still a successful API call.
   *                 The `verified` flag separately tells you if the doc was found.
   *
   *   'failed'    → 'failed' — IDfy itself errored (network, bad request, etc.)
   *
   * This prevents id_not_found from being written to DB as api_status='failed',
   * which would make it look like an API outage rather than a valid "not found".
   */
  mapStatus(vendorStatus, verified) {
    const map = {
      completed:   'success',      // ← fixed: was `verified ? 'completed' : 'failed'`
      success:     'success',
      failed:      'failed',
      error:       'failed',
      timeout:     'timeout',
      pending:     'in_progress',
    };
    return map[vendorStatus?.toLowerCase()] ?? (verified ? 'success' : 'failed');
  }

  /**
   * A verification is considered `verified` when:
   *  1. All required fields are present in the extracted data, AND
   *  2. The vendor's successIndicator field matches its expected value
   *
   * For PAN: verified = (result.source_output.status === 'id_found')
   *          id_not_found → verified=false (but api_status is still 'success')
   */
  isVerified(extracted, mapping, rawResponse) {
    const required    = mapping.required || [];
    const hasRequired = required.every(
      field => extracted[field] !== undefined && extracted[field] !== null
    );
    if (!hasRequired) return false;

    if (mapping.successIndicator) {
      const actual = this.getValueByPath(rawResponse, mapping.successIndicator.path);
      return actual === mapping.successIndicator.value;
    }

    // Fallback: no explicit error and top-level status isn't a failure
    return !rawResponse.error &&
           rawResponse.status !== 'failed' &&
           rawResponse.status !== 'error';
  }
}

module.exports = new ResponseProcessor();