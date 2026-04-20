/**
 * idfyMapping.js
 *
 * Defines how responseProcessor.js extracts and validates fields
 * from raw IDfy v3 sync API responses.
 *
 * Each key (pan / aadhaar / gst) must match the verificationType
 * string passed to responseProcessor.process().
 *
 * Each entry has:
 *   fields           — dot-notation paths into the raw IDfy response
 *   required         — fields that must be present for verified=true
 *   successIndicator — path + value that confirms the document was found
 *   transform        — optional post-extract cleanup (boolean coercions, etc.)
 *
 * ─── IDfy v3 sync response shape — PAN ───────────────────────────────────────
 * {
 *   status: "completed",
 *   request_id, task_id, group_id,
 *   result: {
 *     source_output: {
 *       status: "id_found" | "id_not_found" | "source_down",
 *       name, pan_number, pan_status, last_updated, aadhaar_seeding_status
 *     },
 *     name_match_result: { match_result: "yes"|"no", match_score: 100 }
 *   }
 * }
 *
 * ─── IDfy v3 sync response shape — Aadhaar (ind_aadhaar) ────────────────────
 * {
 *   status: "completed",
 *   request_id, task_id, group_id,
 *   result: {
 *     source_output: {
 *       status:        "id_found" | "id_not_found" | "source_down",
 *       name:          "RAHUL SHARMA",
 *       year_of_birth: "1998",
 *       gender:        "M" | "F" | "T",
 *       area:          "Locality/District",
 *       state:         "KA"
 *     },
 *     name_match_result: { match_result: "yes" | "no", match_score: 95 }
 *   }
 * }
 *
 * UIDAI COMPLIANCE:
 *   - We NEVER store the full Aadhaar number in any mapped field.
 *   - IDfy does not return the full number either — only metadata.
 *   - The raw_response stored in DB also never contains the full number.
 *
 * ─── IDfy v3 sync response shape — GSTIN (ind_gstin) ────────────────────────
 * {
 *   status: "completed",
 *   request_id, task_id, group_id,
 *   result: {
 *     source_output: {
 *       status:                      "id_found" | "id_not_found" | "source_down",
 *       gstin:                       "27ABCDE1234F1Z5",
 *       legal_name:                  "ABC TRADERS PRIVATE LIMITED",
 *       trade_name:                  "ABC TRADERS",
 *       gstin_status:                "Active" | "Cancelled" | "Suspended",
 *       registration_date:           "2018-07-01",
 *       last_updated:                "2023-01-15",
 *       business_type:               "Regular" | "Composition" | ...,
 *       principal_place_of_business: "Mumbai, Maharashtra",
 *       state_jurisdiction:          "Maharashtra",
 *       center_jurisdiction:         "Mumbai Central",
 *       taxpayer_type:               "Regular" | "Composition" | ...
 *     }
 *   }
 * }
 *
 * NOTE: IDfy's ind_gstin does NOT support name_match_result (unlike PAN/Aadhaar).
 * Compare business_name against legal_name / trade_name yourself if needed.
 */

const idfyMapping = {

  // ─── PAN ──────────────────────────────────────────────────────────────────
  //
  // IDfy endpoint: POST /v3/tasks/sync/verify_with_source/ind_pan
  //
  // BE-9: transform() coerces:
  //   aadhaar_seeding_status "Y"/"N"  → aadhaar_linked true/false
  //   name_match_result      "yes"/"no" → name_matched true/false
  // Both booleans make frontend consumption straightforward.
  // ─────────────────────────────────────────────────────────────────────────

  pan: {
    fields: {
      lookup_status:          "result.source_output.status",
      pan_number:             "result.source_output.pan_number",
      name_as_per_nsdl:       "result.source_output.name",
      pan_status:             "result.source_output.pan_status",
      last_updated:           "result.source_output.last_updated",
      aadhaar_seeding_status: "result.source_output.aadhaar_seeding_status",
      name_match_result:      "result.name_match_result.match_result",
      name_match_score:       "result.name_match_result.match_score",
    },

    // No required fields — successIndicator alone determines verified.
    // id_not_found legitimately has all source_output fields populated (name = null, etc.)
    required: [],

    successIndicator: {
      path:  "result.source_output.status",
      value: "id_found",
    },

    /**
     * PAN transform:
     *   aadhaar_seeding_status "Y" → aadhaar_linked: true  (mirrors Aadhaar pattern)
     *   name_match_result "yes"/"no" → name_matched: true/false/null
     *   Attaches request_id and task_id for full audit traceability.
     */
    transform(extracted, raw) {
      return {
        ...extracted,

        // Boolean: is Aadhaar seeded to this PAN?
        // IDfy returns "Y" | "N" — we normalise to boolean.
        aadhaar_linked: extracted.aadhaar_seeding_status === "Y",

        // Boolean: did the submitted name match the name in NSDL?
        // IDfy returns "yes" | "no" — we normalise to boolean.
        // null when name matching was not performed.
        name_matched: extracted.name_match_result != null
          ? extracted.name_match_result === "yes"
          : null,

        // Audit traceability — always attach for every document type
        request_id: raw.request_id ?? null,
        task_id:    raw.task_id    ?? null,
      };
    },
  },

  // ─── Aadhaar ──────────────────────────────────────────────────────────────
  //
  // IDfy endpoint: POST /v3/tasks/sync/verify_with_source/ind_aadhaar
  //
  // What this returns when id_found:
  //   name          — name as per UIDAI records
  //   year_of_birth — year only (UIDAI never exposes full DOB via this API)
  //   gender        — "M" | "F" | "T"
  //   area          — locality/district
  //   state         — 2-letter state code
  //
  // What this does NOT return (UIDAI design):
  //   - Full Aadhaar number
  //   - Full date of birth (year only, by UIDAI design)
  //   - Full address
  //
  // ⚠️  Account activation required — contact eve.support@idfy.com
  // ─────────────────────────────────────────────────────────────────────────

  aadhaar: {
    fields: {
      // Core lookup result
      lookup_status:     "result.source_output.status",

      // UIDAI identity fields
      // Note: IDfy returns 'name' (not 'full_name') for Aadhaar
      name_as_per_uidai: "result.source_output.name",

      // UIDAI provides year only — full DOB not available via this API
      year_of_birth:     "result.source_output.year_of_birth",

      // Gender code
      gender:            "result.source_output.gender",

      // Location metadata (state/area level only — not a full address)
      area:              "result.source_output.area",
      state:             "result.source_output.state",

      // Name match — populated when full_name was sent in the request
      name_match_result: "result.name_match_result.match_result",
      name_match_score:  "result.name_match_result.match_score",
    },

    // No required fields — successIndicator determines verified.
    required: [],

    successIndicator: {
      path:  "result.source_output.status",
      value: "id_found",
    },

    /**
     * Aadhaar transform:
     *   name_match_result "yes"/"no" → name_matched: true/false/null
     *   Attaches request_id and task_id for audit traceability.
     */
    transform(extracted, raw) {
      return {
        ...extracted,

        // Boolean: did submitted name match UIDAI records?
        // null if name match was not performed (full_name not sent).
        name_matched: extracted.name_match_result != null
          ? extracted.name_match_result === "yes"
          : null,

        // Audit traceability
        request_id: raw.request_id ?? null,
        task_id:    raw.task_id    ?? null,
      };
    },
  },

  // ─── GSTIN ────────────────────────────────────────────────────────────────
  //
  // IDfy endpoint: POST /v3/tasks/sync/verify_with_source/ind_gstin
  //
  // What this returns when id_found:
  //   legal_name, trade_name, gstin_status, registration_date,
  //   last_updated, business_type, principal_place_of_business,
  //   state_jurisdiction, center_jurisdiction, taxpayer_type
  //
  // What this does NOT return:
  //   - name_match_result (IDfy ind_gstin has no server-side name matching)
  //     Compare business_name against legal_name / trade_name yourself.
  //
  // ⚠️  Account activation required — contact eve.support@idfy.com
  // ─────────────────────────────────────────────────────────────────────────

  gst: {
    fields: {
      // Core lookup result
      lookup_status: "result.source_output.status",

      // GSTIN echoed back for confirmation
      gstin: "result.source_output.gstin",

      // Business identity
      legal_name: "result.source_output.legal_name",
      trade_name: "result.source_output.trade_name",

      // Registration status
      // Use gstin_active (boolean from transform) for programmatic checks
      gstin_status: "result.source_output.gstin_status",

      // Timeline
      registration_date: "result.source_output.registration_date",
      last_updated:      "result.source_output.last_updated",

      // Business classification
      business_type: "result.source_output.business_type",
      taxpayer_type: "result.source_output.taxpayer_type",

      // Location / jurisdiction
      principal_place_of_business: "result.source_output.principal_place_of_business",
      state_jurisdiction:          "result.source_output.state_jurisdiction",
      center_jurisdiction:         "result.source_output.center_jurisdiction",
    },

    // No required fields — successIndicator determines verified.
    required: [],

    successIndicator: {
      path:  "result.source_output.status",
      value: "id_found",
    },

    /**
     * GSTIN transform:
     *   gstin_status "Active"/"Cancelled"/"Suspended" → gstin_active: boolean
     *   Same boolean-coercion pattern as aadhaar_linked on PAN.
     *   Attaches request_id and task_id for audit traceability.
     */
    transform(extracted, raw) {
      return {
        ...extracted,

        // Boolean: is the GSTIN currently active?
        // "Active" → true, "Cancelled" / "Suspended" / null → false
        gstin_active: extracted.gstin_status?.toLowerCase() === "active",

        // Audit traceability
        request_id: raw.request_id ?? null,
        task_id:    raw.task_id    ?? null,
      };
    },
  },
};

module.exports = idfyMapping;