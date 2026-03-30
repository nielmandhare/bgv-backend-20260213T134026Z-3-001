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
 * NOTE: IDfy's ind_gstin does NOT support name_match_result in the response
 * (unlike PAN and Aadhaar). If you need to verify business_name against the
 * returned legal_name / trade_name, do that comparison in your own controller
 * logic after the result is stored.
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
  //
  // IDfy endpoint: POST /v3/tasks/sync/verify_with_source/ind_gstin
  //
  // What this returns when id_found:
  //   legal_name                  — registered legal name of the entity
  //   trade_name                  — trade name (may differ from legal_name)
  //   gstin_status                — "Active" | "Cancelled" | "Suspended"
  //   registration_date           — when GST registration was granted
  //   last_updated                — last update in the GST portal
  //   business_type               — "Regular" | "Composition" | etc.
  //   principal_place_of_business — address string
  //   state_jurisdiction          — state where registered
  //   center_jurisdiction         — central tax jurisdiction
  //   taxpayer_type               — "Regular" | "Composition" | etc.
  //
  // What this does NOT return:
  //   - name_match_result (IDfy ind_gstin has no server-side name matching)
  //     Compare business_name against legal_name / trade_name yourself if needed.
  //
  // ⚠️  Account activation required — contact eve.support@idfy.com
  // ─────────────────────────────────────────────────────────────────────────

  gst: {
    fields: {
      // Core lookup result — same pattern as PAN and Aadhaar
      lookup_status: 'result.source_output.status',

      // GSTIN echoed back for confirmation
      gstin: 'result.source_output.gstin',

      // Business identity
      legal_name: 'result.source_output.legal_name',
      trade_name: 'result.source_output.trade_name',

      // Registration status — "Active" | "Cancelled" | "Suspended"
      // Use gstin_active (from transform) for boolean checks
      gstin_status: 'result.source_output.gstin_status',

      // Timeline
      registration_date: 'result.source_output.registration_date',
      last_updated:      'result.source_output.last_updated',

      // Business classification
      business_type:  'result.source_output.business_type',
      taxpayer_type:  'result.source_output.taxpayer_type',

      // Location / jurisdiction
      principal_place_of_business: 'result.source_output.principal_place_of_business',
      state_jurisdiction:          'result.source_output.state_jurisdiction',
      center_jurisdiction:         'result.source_output.center_jurisdiction',
    },

    // No required fields — id_not_found will have nulls for all source_output
    // fields. verified is determined entirely by successIndicator.
    required: [],

    successIndicator: {
      path:  'result.source_output.status',
      value: 'id_found',
    },

    transform(extracted, raw) {
      return {
        ...extracted,

        // Normalise gstin_status to a boolean for easy frontend consumption.
        // "Active" → true, anything else (Cancelled, Suspended, null) → false.
        // Same pattern as aadhaar_linked on PAN.
        gstin_active: extracted.gstin_status?.toLowerCase() === 'active',

        // Audit fields — always attach for traceability
        request_id: raw.request_id ?? null,
        task_id:    raw.task_id    ?? null,
      };
    },
  },
};

module.exports = idfyMapping;