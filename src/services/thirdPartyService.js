const { makeRequest } = require('../utils/apiClient');
const axios = require('axios');

// ─────────────────────────────────────────────────────────────────────────────
// normaliseDob
//
// IDfy requires dob as plain "YYYY-MM-DD" string.
// PostgreSQL returns dob as a JS Date object via RETURNING *.
// This converts either a Date object or ISO timestamp string → "YYYY-MM-DD".
// ─────────────────────────────────────────────────────────────────────────────
function normaliseDob(dob) {
  if (!dob) return '1900-01-01';
  if (typeof dob === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dob)) return dob;
  const d = (dob instanceof Date) ? dob : new Date(dob);
  if (isNaN(d.getTime())) return '1900-01-01';
  const offset = d.getTimezoneOffset() * 60000;
  const local  = new Date(d.getTime() - offset);
  return local.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// normaliseAadhaar
//
// The validator accepts "XXXX-XXXX-1234" format.
// IDfy expects only the last 4 digits as the id_number for masked verification.
// We extract just the last 4 digits so IDfy gets exactly what it needs.
//
// Example: "XXXX-XXXX-1234" → "1234"
// ─────────────────────────────────────────────────────────────────────────────
function normaliseAadhaar(maskedAadhaar) {
  if (!maskedAadhaar) throw new Error('masked_aadhaar is required');
  // Extract the last 4 digits from "XXXX-XXXX-1234"
  const match = maskedAadhaar.match(/(\d{4})$/);
  if (!match) throw new Error(`Invalid masked_aadhaar format: ${maskedAadhaar}`);
  return match[1];
}

const IDFY_BASE_URL   = process.env.THIRD_PARTY_BASE_URL || 'https://eve.idfy.com';
const IDFY_ACCOUNT_ID = process.env.THIRD_PARTY_API_SECRET;
const IDFY_API_KEY    = process.env.THIRD_PARTY_API_KEY;

const thirdPartyService = {

  // ───────────────────────────────────────────────────────────────────────────
  // verifyPAN
  // Calls IDfy Eve v3 sync endpoint for PAN verification.
  // Endpoint: POST /v3/tasks/sync/verify_with_source/ind_pan
  // ───────────────────────────────────────────────────────────────────────────
  async verifyPAN(data) {
    console.log('[IDfy] CODE VERSION: flat-body-dob-v2');
    const taskId  = `pan_${Date.now()}`;
    const groupId = `bgv_${Date.now()}`;
    const dob     = normaliseDob(data.dob);
    const body = {
      task_id:  taskId,
      group_id: groupId,
      data: { id_number: data.pan_number, full_name: data.full_name || 'NA', dob },
    };
    console.log(`[IDfy] PAN verify  task_id=${taskId}`);
    console.log(`[IDfy] REQUEST BODY  ${JSON.stringify(body, null, 2)}`);
    const response = await makeRequest('POST', '/v3/tasks/sync/verify_with_source/ind_pan', body);
    console.log(`[IDfy] RAW RESPONSE  ${JSON.stringify(response, null, 2)}`);
    thirdPartyService._assertResult(response, 'PAN');
    return response;
  },

  // ───────────────────────────────────────────────────────────────────────────
  // verifyPAN_async
  // Alternative async+poll variant (not used in the main flow but kept for
  // future use or manual testing).
  // ───────────────────────────────────────────────────────────────────────────
  async verifyPAN_async(data) {
    const taskId  = `pan_${Date.now()}`;
    const groupId = `bgv_${Date.now()}`;
    const dob     = normaliseDob(data.dob);
    const body = {
      task_id: taskId, group_id: groupId,
      data: { id_number: data.pan_number.trim().toUpperCase(), full_name: data.full_name || 'NA', dob },
    };
    const createRes = await axios.post(
      `${IDFY_BASE_URL}/v3/tasks/async/verify_with_source/ind_pan`, body,
      { headers: { 'api-key': IDFY_API_KEY, 'account-id': IDFY_ACCOUNT_ID, 'Content-Type': 'application/json' } }
    );
    const requestId = createRes.data.request_id;
    const result    = await thirdPartyService._pollForResult(requestId);
    thirdPartyService._assertResult(result, 'PAN');
    return result;
  },

  // ───────────────────────────────────────────────────────────────────────────
  // verifyAadhaar
  //
  // Calls IDfy Eve v3 sync endpoint for Aadhaar masked verification.
  // Endpoint: POST /v3/tasks/sync/verify_with_source/ind_aadhaar
  //
  // ⚠️  ACCOUNT STATUS: This endpoint is NOT yet enabled on this IDfy account.
  //     Contact eve.support@idfy.com with your account-id to activate it.
  //     The code below is fully wired — it will work the moment the account
  //     is activated. Until then, IDfy will return a 403/402 error which gets
  //     caught, stored in failure_reason, and api_status = 'failed' in the DB.
  //
  // UIDAI COMPLIANCE NOTE:
  //   - We accept only masked Aadhaar (XXXX-XXXX-NNNN format) — never the full number.
  //   - Only the last 4 digits are sent to IDfy as id_number.
  //   - The masked format is never stored or logged in plaintext.
  //   - Full Aadhaar numbers are never accepted, stored, or transmitted.
  //
  // IDfy Request shape (ind_aadhaar):
  //   {
  //     task_id:  "aadhaar_<timestamp>",
  //     group_id: "bgv_<timestamp>",
  //     data: {
  //       id_number: "1234",        ← last 4 digits only
  //       full_name: "Rahul Sharma" ← for name match
  //     }
  //   }
  //
  // IDfy Response shape (when account is enabled):
  //   {
  //     status: "completed",
  //     request_id: "uuid",
  //     task_id: "aadhaar_...",
  //     result: {
  //       source_output: {
  //         status: "id_found" | "id_not_found" | "source_down",
  //         name:          "RAHUL SHARMA",
  //         year_of_birth: "1998",
  //         gender:        "M",
  //         area:          "Karnataka",
  //         state:         "KA"
  //       },
  //       name_match_result: {
  //         match_result: "yes" | "no",
  //         match_score:  95
  //       }
  //     }
  //   }
  // ───────────────────────────────────────────────────────────────────────────
  async verifyAadhaar(data) {
    const taskId  = `aadhaar_${Date.now()}`;
    const groupId = `bgv_${Date.now()}`;

    // Extract last 4 digits from "XXXX-XXXX-1234"
    const last4 = normaliseAadhaar(data.masked_aadhaar);

    const body = {
      task_id:  taskId,
      group_id: groupId,
      data: {
        id_number: last4,
        full_name: data.full_name || 'NA',
      },
    };

    console.log(`[IDfy] Aadhaar verify  task_id=${taskId}`);
    console.log(`[IDfy] REQUEST BODY  ${JSON.stringify(body, null, 2)}`);

    // NOTE: If the account is not enabled for Aadhaar, IDfy will return a
    // non-2xx HTTP error. makeRequest's Axios interceptor will throw, which
    // gets caught in runAadhaarVerificationAsync → written to failure_reason.
    const response = await makeRequest(
      'POST',
      '/v3/tasks/sync/verify_with_source/ind_aadhaar',
      body
    );

    console.log(`[IDfy] RAW RESPONSE  ${JSON.stringify(response, null, 2)}`);

    // _assertResult validates: task not failed, source_output present, not source_down
    thirdPartyService._assertResult(response, 'Aadhaar');
    return response;
  },

  // ───────────────────────────────────────────────────────────────────────────
  // verifyGSTIN
  //
  // Calls IDfy Eve v3 sync endpoint for GSTIN verification.
  // Endpoint: POST /v3/tasks/sync/verify_with_source/ind_gstin
  //
  // ⚠️  ACCOUNT STATUS: This endpoint may not be enabled on this IDfy account.
  //     Contact eve.support@idfy.com with your account-id to activate it.
  //     The code below is fully wired — it will work the moment the account
  //     is activated. Until then, IDfy will return a 404/403 error which gets
  //     caught, stored in failure_reason, and api_status = 'failed' in the DB.
  //
  // WHY business_name IS NOT SENT TO IDfy:
  //   The IDfy ind_gstin endpoint only accepts id_number (the GSTIN itself).
  //   It does not support server-side name matching like PAN does.
  //   The business_name field is stored in our DB for our own records.
  //   If you want to cross-check, compare record.business_name against
  //   the legal_name / trade_name returned in the IDfy response yourself.
  //
  // IDfy Request shape (ind_gstin):
  //   {
  //     task_id:  "gstin_<timestamp>",
  //     group_id: "bgv_<timestamp>",
  //     data: {
  //       id_number: "27ABCDE1234F1Z5"   ← the GSTIN itself
  //     }
  //   }
  //
  // IDfy Response shape (when account is enabled):
  //   {
  //     status: "completed",
  //     request_id: "uuid",
  //     task_id: "gstin_...",
  //     result: {
  //       source_output: {
  //         status:                      "id_found" | "id_not_found" | "source_down",
  //         gstin:                       "27ABCDE1234F1Z5",
  //         legal_name:                  "ABC TRADERS PRIVATE LIMITED",
  //         trade_name:                  "ABC TRADERS",
  //         gstin_status:                "Active",
  //         registration_date:           "2018-07-01",
  //         last_updated:                "2023-01-15",
  //         business_type:               "Regular",
  //         principal_place_of_business: "Mumbai, Maharashtra",
  //         state_jurisdiction:          "Maharashtra",
  //         center_jurisdiction:         "Mumbai Central",
  //         taxpayer_type:               "Regular"
  //       }
  //     }
  //   }
  // ───────────────────────────────────────────────────────────────────────────
  async verifyGSTIN(data) {
    const taskId  = `gstin_${Date.now()}`;
    const groupId = `bgv_${Date.now()}`;

    const body = {
      task_id:  taskId,
      group_id: groupId,
      data: {
        id_number: data.gstin,
        // business_name intentionally NOT sent — IDfy ind_gstin does not
        // support server-side name matching. See comment above.
      },
    };

    console.log(`[IDfy] GSTIN verify  task_id=${taskId}`);
    console.log(`[IDfy] REQUEST BODY  ${JSON.stringify(body, null, 2)}`);

    const response = await makeRequest(
      'POST',
      '/v3/tasks/sync/verify_with_source/ind_gstin',
      body
    );

    console.log(`[IDfy] RAW RESPONSE  ${JSON.stringify(response, null, 2)}`);

    thirdPartyService._assertResult(response, 'GSTIN');
    return response;
  },

  // ───────────────────────────────────────────────────────────────────────────
  // _pollForResult
  // Internal helper for async+poll pattern (used by verifyPAN_async).
  // ───────────────────────────────────────────────────────────────────────────
  async _pollForResult(requestId, maxAttempts = 30, intervalMs = 2000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const res   = await axios.get(`${IDFY_BASE_URL}/v3/tasks`,
        { params: { request_id: requestId }, headers: { 'api-key': IDFY_API_KEY, 'account-id': IDFY_ACCOUNT_ID } });
      const tasks = res.data;
      const task  = Array.isArray(tasks) ? tasks.find(t => t.request_id === requestId) : tasks;
      if (!task) { await new Promise(r => setTimeout(r, intervalMs)); continue; }
      if (task.status === 'completed' || task.status === 'failed') return task;
      await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error(`[IDfy] Polling timed out after ${maxAttempts} attempts`);
  },

  // ───────────────────────────────────────────────────────────────────────────
  // _assertResult
  //
  // Validates the raw IDfy response for any verification type.
  // Throws if:
  //   - response is empty
  //   - top-level task status is 'failed'
  //   - source_output is missing (API-level failure)
  //   - source is down (transient UIDAI/NSDL/GST outage — should be retried later)
  //
  // Does NOT throw for id_not_found — that is a valid successful API call
  // where the document simply doesn't exist in the govt DB.
  // ───────────────────────────────────────────────────────────────────────────
  _assertResult(response, label) {
    if (!response) throw new Error(`[IDfy] ${label}: empty response`);
    const taskStatus   = response.status;
    const sourceOutput = response?.result?.source_output;
    if (taskStatus === 'failed' || !sourceOutput)
      throw new Error(`[IDfy] ${label}: task failed or missing source_output  ${JSON.stringify(response)}`);
    const lookupStatus = sourceOutput.status;
    if (lookupStatus === 'source_down')
      throw new Error(`[IDfy] ${label}: source_down — govt source unavailable, retry later`);
    console.log(`[IDfy] ${label}: taskStatus=${taskStatus}, lookupStatus=${lookupStatus}, request_id=${response.request_id}`);
  },

  // ───────────────────────────────────────────────────────────────────────────
  // pollResult
  // Public polling helper used for manual/webhook-based result retrieval.
  // ───────────────────────────────────────────────────────────────────────────
  async pollResult(requestId, maxAttempts = 10, intervalMs = 2000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const response = await makeRequest('GET', '/v3/tasks', {}, { request_id: requestId });
      const task     = Array.isArray(response) ? response[0] : response;
      const status   = task?.result?.source_output?.status;
      if (status === 'id_found' || status === 'id_not_found') return task;
      if (task?.status === 'failed') throw new Error(`[IDfy] Failed: ${JSON.stringify(task.result)}`);
      if (status === 'source_down') throw new Error('[IDfy] source_down: retry later');
      if (attempt < maxAttempts) await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error(`[IDfy] Polling timed out after ${maxAttempts} attempts`);
  },
};

module.exports = thirdPartyService;