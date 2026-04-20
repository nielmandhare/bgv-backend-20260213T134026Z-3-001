const { makeRequest } = require("../utils/apiClient");
const axios           = require("axios");

// ─────────────────────────────────────────────────────────────────────────────
// normaliseDob
//
// IDfy requires dob as plain "YYYY-MM-DD" string.
// PostgreSQL returns dob columns as JS Date objects via RETURNING *.
// This converts either a Date object or an ISO timestamp string → "YYYY-MM-DD"
// without timezone distortion (local-time conversion before slicing).
// ─────────────────────────────────────────────────────────────────────────────
function normaliseDob(dob) {
  if (!dob) return "1900-01-01";
  // Already in the right format — pass through
  if (typeof dob === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dob)) return dob;
  const d = dob instanceof Date ? dob : new Date(dob);
  if (isNaN(d.getTime())) return "1900-01-01";
  // Shift to local time before slicing to avoid UTC midnight → previous day
  const offset = d.getTimezoneOffset() * 60000;
  const local  = new Date(d.getTime() - offset);
  return local.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// normaliseAadhaar
//
// Input:  "XXXX-XXXX-1234"  (masked Aadhaar — what the validator accepts)
// Output: "1234"            (last 4 digits — what IDfy expects as id_number)
//
// UIDAI compliance: we never accept, store, or transmit the full 12-digit
// Aadhaar number. Only the last 4 digits are ever sent to IDfy.
// ─────────────────────────────────────────────────────────────────────────────
function normaliseAadhaar(maskedAadhaar) {
  if (!maskedAadhaar) throw new Error("masked_aadhaar is required");
  const match = maskedAadhaar.match(/(\d{4})$/);
  if (!match) throw new Error(`Invalid masked_aadhaar format: ${maskedAadhaar}`);
  return match[1];
}

const IDFY_BASE_URL   = process.env.THIRD_PARTY_BASE_URL || "https://eve.idfy.com";
const IDFY_ACCOUNT_ID = process.env.THIRD_PARTY_API_SECRET;
const IDFY_API_KEY    = process.env.THIRD_PARTY_API_KEY;

const thirdPartyService = {

  // ───────────────────────────────────────────────────────────────────────────
  // verifyPAN
  //
  // Calls IDfy Eve v3 sync endpoint for PAN verification.
  // Endpoint: POST /v3/tasks/sync/verify_with_source/ind_pan
  //
  // BE-9 status flow triggered from here:
  //   setProcessing() → verifyPAN() → [setSuccess() | setFailed()] in controller
  //
  // The normaliseDob() call here is critical — IDfy rejects ISO 8601 timestamps.
  // PostgreSQL's RETURNING * gives us a JS Date object; normaliseDob converts it.
  // ───────────────────────────────────────────────────────────────────────────
  async verifyPAN(data) {
    console.log("[IDfy] verifyPAN — entry");
    const taskId  = `pan_${Date.now()}`;
    const groupId = `bgv_${Date.now()}`;
    const dob     = normaliseDob(data.dob);

    const body = {
      task_id:  taskId,
      group_id: groupId,
      data: {
        id_number: data.pan_number,
        full_name: data.full_name || "NA",
        dob,
      },
    };

    console.log(`[IDfy] PAN verify — task_id=${taskId}, dob=${dob}`);
    console.log(`[IDfy REQUEST] POST ${IDFY_BASE_URL}/v3/tasks/sync/verify_with_source/ind_pan`);
    console.log(`[IDfy REQUEST BODY] ${JSON.stringify(body, null, 2)}`);

    const response = await makeRequest(
      "POST",
      "/v3/tasks/sync/verify_with_source/ind_pan",
      body
    );

    console.log(`[IDfy RESPONSE] ${JSON.stringify(response, null, 2)}`);
    thirdPartyService._assertResult(response, "PAN");
    return response;
  },

  // ───────────────────────────────────────────────────────────────────────────
  // verifyPAN_async (alternative async+poll variant)
  //
  // Not used in the main verification flow but kept for manual testing
  // or future background-job scenarios.
  // ───────────────────────────────────────────────────────────────────────────
  async verifyPAN_async(data) {
    const taskId  = `pan_${Date.now()}`;
    const groupId = `bgv_${Date.now()}`;
    const dob     = normaliseDob(data.dob);

    const body = {
      task_id:  taskId,
      group_id: groupId,
      data: {
        id_number: data.pan_number.trim().toUpperCase(),
        full_name: data.full_name || "NA",
        dob,
      },
    };

    const createRes = await axios.post(
      `${IDFY_BASE_URL}/v3/tasks/async/verify_with_source/ind_pan`,
      body,
      {
        headers: {
          "api-key":    IDFY_API_KEY,
          "account-id": IDFY_ACCOUNT_ID,
          "Content-Type": "application/json",
        },
      }
    );

    const requestId = createRes.data.request_id;
    const result    = await thirdPartyService._pollForResult(requestId);
    thirdPartyService._assertResult(result, "PAN");
    return result;
  },

  // ───────────────────────────────────────────────────────────────────────────
  // verifyAadhaar
  //
  // Calls IDfy Eve v3 sync endpoint for Aadhaar masked verification.
  // Endpoint: POST /v3/tasks/sync/verify_with_source/ind_aadhaar
  //
  // ⚠️  ACCOUNT STATUS: This endpoint returns 404 NOT_FOUND on the current
  //     IDfy account tier. The code is fully wired — zero changes needed once
  //     the account is activated. The error is caught in runVerificationAsync,
  //     stored in failure_reason, and api_status = 'failed' in the DB.
  //     Contact: eve.support@idfy.com with your account-id to activate.
  //
  // UIDAI COMPLIANCE:
  //   - Only the last 4 digits of Aadhaar are sent to IDfy (via normaliseAadhaar).
  //   - Full Aadhaar numbers are never accepted, stored, logged, or transmitted.
  //
  // IDfy Request shape:
  //   { task_id, group_id, data: { id_number: "1234", full_name: "..." } }
  //
  // IDfy Response shape (when account is enabled):
  //   { status: "completed", result: { source_output: { status: "id_found",
  //     name, year_of_birth, gender, area, state },
  //     name_match_result: { match_result, match_score } } }
  // ───────────────────────────────────────────────────────────────────────────
  async verifyAadhaar(data) {
    const taskId  = `aadhaar_${Date.now()}`;
    const groupId = `bgv_${Date.now()}`;
    const last4   = normaliseAadhaar(data.masked_aadhaar);

    const body = {
      task_id:  taskId,
      group_id: groupId,
      data: {
        id_number: last4,
        full_name: data.full_name || "NA",
      },
    };

    console.log(`[IDfy] Aadhaar verify — task_id=${taskId}, last4=****`);
    console.log(`[IDfy REQUEST] POST ${IDFY_BASE_URL}/v3/tasks/sync/verify_with_source/ind_aadhaar`);
    console.log(`[IDfy REQUEST BODY] ${JSON.stringify(body, null, 2)}`);

    // If account is not enabled, makeRequest throws with IDfy's 404/403 body.
    // runVerificationAsync catches that and writes it to failure_reason.
    const response = await makeRequest(
      "POST",
      "/v3/tasks/sync/verify_with_source/ind_aadhaar",
      body
    );

    console.log(`[IDfy RESPONSE] ${JSON.stringify(response, null, 2)}`);
    thirdPartyService._assertResult(response, "Aadhaar");
    return response;
  },

  // ───────────────────────────────────────────────────────────────────────────
  // verifyGSTIN
  //
  // Calls IDfy Eve v3 sync endpoint for GSTIN verification.
  // Endpoint: POST /v3/tasks/sync/verify_with_source/ind_gstin
  //
  // ⚠️  ACCOUNT STATUS: Same as Aadhaar — returns 404 on current tier.
  //     Code is fully wired. Contact eve.support@idfy.com to activate.
  //
  // WHY business_name IS NOT SENT TO IDfy:
  //   ind_gstin does not support server-side name matching (unlike PAN).
  //   business_name is stored in verification_requests for our own records.
  //   Compare against legal_name / trade_name in the IDfy response yourself.
  //
  // IDfy Request shape:
  //   { task_id, group_id, data: { id_number: "27ABCDE1234F1Z5" } }
  //
  // IDfy Response shape (when account is enabled):
  //   { status: "completed", result: { source_output: { status: "id_found",
  //     gstin, legal_name, trade_name, gstin_status, registration_date,
  //     last_updated, business_type, principal_place_of_business,
  //     state_jurisdiction, center_jurisdiction, taxpayer_type } } }
  // ───────────────────────────────────────────────────────────────────────────
  async verifyGSTIN(data) {
    const taskId  = `gstin_${Date.now()}`;
    const groupId = `bgv_${Date.now()}`;

    const body = {
      task_id:  taskId,
      group_id: groupId,
      data: {
        id_number: data.gstin,
        // business_name intentionally NOT sent — ind_gstin has no name matching
      },
    };

    console.log(`[IDfy] GSTIN verify — task_id=${taskId}`);
    console.log(`[IDfy REQUEST] POST ${IDFY_BASE_URL}/v3/tasks/sync/verify_with_source/ind_gstin`);
    console.log(`[IDfy REQUEST BODY] ${JSON.stringify(body, null, 2)}`);

    const response = await makeRequest(
      "POST",
      "/v3/tasks/sync/verify_with_source/ind_gstin",
      body
    );

    console.log(`[IDfy RESPONSE] ${JSON.stringify(response, null, 2)}`);
    thirdPartyService._assertResult(response, "GSTIN");
    return response;
  },

  // ───────────────────────────────────────────────────────────────────────────
  // _pollForResult (internal)
  //
  // Used by verifyPAN_async for the async+poll pattern.
  // Not used in the main sync flow.
  // ───────────────────────────────────────────────────────────────────────────
  async _pollForResult(requestId, maxAttempts = 30, intervalMs = 2000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const res = await axios.get(`${IDFY_BASE_URL}/v3/tasks`, {
        params:  { request_id: requestId },
        headers: { "api-key": IDFY_API_KEY, "account-id": IDFY_ACCOUNT_ID },
      });

      const tasks = res.data;
      const task  = Array.isArray(tasks)
        ? tasks.find((t) => t.request_id === requestId)
        : tasks;

      if (!task) {
        await new Promise((r) => setTimeout(r, intervalMs));
        continue;
      }

      if (task.status === "completed" || task.status === "failed") return task;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`[IDfy] Polling timed out after ${maxAttempts} attempts`);
  },

  // ───────────────────────────────────────────────────────────────────────────
  // _assertResult
  //
  // Validates the raw IDfy response for any document type.
  //
  // Throws when:
  //   - response is null/undefined
  //   - top-level task status is 'failed'
  //   - source_output is missing entirely (means IDfy had an API-level error)
  //   - lookup_status is 'source_down' (transient govt DB outage — should retry)
  //
  // Does NOT throw for 'id_not_found' — that is a valid, complete API call
  // where the document simply doesn't exist in the government database.
  // The controller's setSuccess() will still run; verified=false is stored.
  //
  // BE-9: This is the gate between a "vendor failed" (throw → setFailed) and
  // a "vendor succeeded but doc not found" (no throw → setSuccess, verified=false).
  // ───────────────────────────────────────────────────────────────────────────
  _assertResult(response, label) {
    if (!response) {
      throw new Error(`[IDfy] ${label}: empty response`);
    }

    const taskStatus   = response.status;
    const sourceOutput = response?.result?.source_output;

    if (taskStatus === "failed" || !sourceOutput) {
      throw new Error(
        `[IDfy] ${label}: task failed or missing source_output — ${JSON.stringify(response)}`
      );
    }

    const lookupStatus = sourceOutput.status;

    if (lookupStatus === "source_down") {
      throw new Error(
        `[IDfy] ${label}: source_down — govt source unavailable, should retry later`
      );
    }

    // Log the outcome clearly — id_not_found is NOT an error, just a result
    if (lookupStatus === "id_not_found") {
      console.log(
        `[IDfy] ${label}: id_not_found — document not in govt database ` +
        `(valid API response, verified=false) — request_id=${response.request_id}`
      );
    } else {
      console.log(
        `[IDfy] ${label}: taskStatus=${taskStatus}, lookupStatus=${lookupStatus}, ` +
        `request_id=${response.request_id}`
      );
    }
  },

  // ───────────────────────────────────────────────────────────────────────────
  // pollResult (public)
  //
  // Public polling helper for webhook-based or manual result retrieval.
  // Different from _pollForResult — uses makeRequest (not raw axios) and
  // checks source_output.status instead of top-level task status.
  // ───────────────────────────────────────────────────────────────────────────
  async pollResult(requestId, maxAttempts = 10, intervalMs = 2000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const response = await makeRequest("GET", "/v3/tasks", {}, { request_id: requestId });
      const task     = Array.isArray(response) ? response[0] : response;
      const status   = task?.result?.source_output?.status;

      if (status === "id_found" || status === "id_not_found") return task;
      if (task?.status === "failed") throw new Error(`[IDfy] Failed: ${JSON.stringify(task.result)}`);
      if (status === "source_down") throw new Error("[IDfy] source_down — retry later");

      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`[IDfy] pollResult timed out after ${maxAttempts} attempts`);
  },
};

module.exports = thirdPartyService;