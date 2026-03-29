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
 *   transform        — optional post-extract cleanup
 *
 * ─── IDfy v3 sync response shape ─────────────────────────────────────────────
 * {
 *   status:     "completed",          ← top-level task status (always check this)
 *   request_id, task_id, group_id,
 *   result: {
 *     source_output: {
 *       status: "id_found" | "id_not_found" | "source_down" | "failed",
 *       -- PAN fields (populated only when status = "id_found") --
 *       name:                   "JOHN DOE",
 *       pan_number:             "AAAAA0000A",
 *       pan_status:             "E",           // E = existing & valid
 *       last_updated:           "YYYY-MM-DD",
 *       aadhaar_seeding_status: "Y" | "N",
 *     },
 *     name_match_result: {            // present only when full_name was sent
 *       match_result: "yes" | "no",
 *       match_score:  100,
 *     }
 *   }
 * }
 */

const idfyMapping = {

  // ─── PAN ──────────────────────────────────────────────────────────────────

  pan: {
    // Dot-notation paths resolved by responseProcessor.getValueByPath()
    fields: {
      lookup_status:          'result.source_output.status',   // "id_found" | "id_not_found"
      pan_number:             'result.source_output.pan_number',
      name_as_per_nsdl:       'result.source_output.name',
      pan_status:             'result.source_output.pan_status',
      last_updated:           'result.source_output.last_updated',
      aadhaar_seeding_status: 'result.source_output.aadhaar_seeding_status',
      name_match_result:      'result.name_match_result.match_result',
      name_match_score:       'result.name_match_result.match_score',
    },

    // No required fields — id_not_found legitimately has all source_output
    // fields as null. verified is determined entirely by successIndicator.
    required: [],

    // verified = true only when NSDL confirms the PAN exists
    successIndicator: {
      path:  'result.source_output.status',
      value: 'id_found',
    },

    // Post-extract cleanup
    transform(extracted, raw) {
      return {
        ...extracted,
        // Normalise aadhaar linkage to boolean
        aadhaar_linked: extracted.aadhaar_seeding_status === 'Y',
        // Audit fields
        request_id: raw.request_id ?? null,
        task_id:    raw.task_id    ?? null,
      };
    },
  },

  // ─── Aadhaar ──────────────────────────────────────────────────────────────
  // ❌ Not enabled on this IDfy account — stub mapping kept for completeness.

  aadhaar: {
    fields: {
      lookup_status:     'result.source_output.status',
      name_as_per_uidai: 'result.source_output.name',
      year_of_birth:     'result.source_output.year_of_birth',
      gender:            'result.source_output.gender',
      name_match_result: 'result.name_match_result.match_result',
      name_match_score:  'result.name_match_result.match_score',
    },

    required: [],

    successIndicator: {
      path:  'result.source_output.status',
      value: 'id_found',
    },

    transform(extracted, raw) {
      return {
        ...extracted,
        request_id: raw.request_id ?? null,
        task_id:    raw.task_id    ?? null,
      };
    },
  },

  // ─── GSTIN ────────────────────────────────────────────────────────────────
  // ❌ Not enabled on this IDfy account — stub mapping kept for completeness.

  gst: {
    fields: {
      lookup_status:     'result.source_output.status',
      legal_name:        'result.source_output.legal_name',
      trade_name:        'result.source_output.trade_name',
      gstin_status:      'result.source_output.gstin_status',
      registration_date: 'result.source_output.registration_date',
    },

    required: [],

    successIndicator: {
      path:  'result.source_output.status',
      value: 'id_found',
    },

    transform(extracted, raw) {
      return {
        ...extracted,
        request_id: raw.request_id ?? null,
        task_id:    raw.task_id    ?? null,
      };
    },
  },
};

module.exports = idfyMapping;