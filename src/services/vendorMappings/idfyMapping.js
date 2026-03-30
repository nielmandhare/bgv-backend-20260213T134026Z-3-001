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
 *       name:          "RAHUL SHARMA",   ← name as per UIDAI
 *       year_of_birth: "1998",
 *       gender:        "M" | "F" | "T",
 *       area:          "Locality/District",
 *       state:         "KA"              ← state code
 *     },
 *     name_match_result: {
 *       match_result: "yes" | "no",
 *       match_score:  95
 *     }
 *   }
 * }
 *
 * UIDAI COMPLIANCE:
 *   - We NEVER store the full Aadhaar number anywhere in the mapped fields.
 *   - IDfy does not return the full Aadhaar number in the response either
 *     (only metadata like name, year_of_birth, gender, state).
 *   - The raw_response is stored in DB for audit, but it also never contains
 *     the full number — IDfy masks it at the source.
 */

const idfyMapping = {

  // ─── PAN ──────────────────────────────────────────────────────────────────

  pan: {
    fields: {
      lookup_status:          'result.source_output.status',
      pan_number:             'result.source_output.pan_number',
      name_as_per_nsdl:       'result.source_output.name',
      pan_status:             'result.source_output.pan_status',
      last_updated:           'result.source_output.last_updated',
      aadhaar_seeding_status: 'result.source_output.aadhaar_seeding_status',
      name_match_result:      'result.name_match_result.match_result',
      name_match_score:       'result.name_match_result.match_score',
    },

    required: [],

    successIndicator: {
      path:  'result.source_output.status',
      value: 'id_found',
    },

    transform(extracted, raw) {
      return {
        ...extracted,
        aadhaar_linked: extracted.aadhaar_seeding_status === 'Y',
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
  //   name          — name as per UIDAI records (for name match validation)
  //   year_of_birth — year only (UIDAI never exposes full DOB via this API)
  //   gender        — "M" | "F" | "T"
  //   area          — locality/district
  //   state         — 2-letter state code
  //
  // What this does NOT return (by UIDAI design):
  //   - Full Aadhaar number (only last 4 were sent, nothing is echoed back)
  //   - Full date of birth (year only)
  //   - Full address
  //
  // ⚠️  Account activation required — contact eve.support@idfy.com
  // ─────────────────────────────────────────────────────────────────────────

  aadhaar: {
    fields: {
      // Core lookup result
      lookup_status:     'result.source_output.status',

      // Identity fields returned by UIDAI (via IDfy)
      // Note: IDfy returns 'name' (not 'full_name') for Aadhaar
      name_as_per_uidai: 'result.source_output.name',

      // UIDAI only provides year of birth, not full DOB — by design
      year_of_birth:     'result.source_output.year_of_birth',

      // Gender code: "M" | "F" | "T"
      gender:            'result.source_output.gender',

      // Location metadata (not sensitive — state/area level only)
      area:              'result.source_output.area',
      state:             'result.source_output.state',

      // Name match — populated when full_name was sent in the request
      name_match_result: 'result.name_match_result.match_result',
      name_match_score:  'result.name_match_result.match_score',
    },

    // No required fields — id_not_found legitimately has all source_output
    // fields as null. verified is determined entirely by successIndicator.
    required: [],

    successIndicator: {
      path:  'result.source_output.status',
      value: 'id_found',
    },

    transform(extracted, raw) {
      return {
        ...extracted,

        // Normalise name_match_result to boolean for easier frontend consumption.
        // IDfy returns "yes" | "no" as a string — we map to true/false.
        // null if name match was not performed (e.g. full_name not sent).
        name_matched: extracted.name_match_result != null
          ? extracted.name_match_result === 'yes'
          : null,

        // Audit fields — always attach for traceability
        request_id: raw.request_id ?? null,
        task_id:    raw.task_id    ?? null,
      };
    },
  },

  // ─── GSTIN ────────────────────────────────────────────────────────────────
  // ⚠️  Not enabled on this IDfy account — stub kept for completeness.

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