console.log("✅ VERIFICATION CONTROLLER LOADED — BE-9");

const db                = require("../utils/db");
const thirdPartyService = require("../services/thirdPartyService");
const responseProcessor = require("../services/responseProcessor");

// ─────────────────────────────────────────────────────────────────────────────
// extractErrorMessage
//
// Axios errors bury the real IDfy error inside error.response.data.
// Without this helper, failure_reason in the DB gets the generic Axios string
// ("Request failed with status code 404") instead of IDfy's actual payload.
//
// Priority order:
//   1. IDfy's own { error, message } body  → "NOT_FOUND: Bad Request"
//   2. data.message alone                  → just the message string
//   3. data as a string                    → raw string body
//   4. JSON-serialised data object         → last resort stringification
//   5. Axios err.message                   → generic Axios message
//   6. Hardcoded fallback                  → "Unknown error"
// ─────────────────────────────────────────────────────────────────────────────
function extractErrorMessage(err) {
  const data = err?.response?.data;
  if (data) {
    if (data.error && data.message) return `${data.error}: ${data.message}`;
    if (data.message)               return data.message;
    if (typeof data === "string")   return data;
    return JSON.stringify(data);
  }
  return err.message || "Unknown error";
}

// ─────────────────────────────────────────────────────────────────────────────
// setProcessing
//
// BE-9 Step 1 — Transition: pending → processing
//
// Called immediately before the IDfy HTTP call is fired.
// Records:
//   api_status       = 'processing'
//   last_api_attempt = NOW()   ← timestamp of this specific attempt
// ─────────────────────────────────────────────────────────────────────────────
async function setProcessing(id) {
  await db.query(
    `UPDATE verification_requests
     SET api_status       = 'processing',
         last_api_attempt = NOW()
     WHERE id = $1`,
    [id]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// setSuccess
//
// BE-9 Step 3 (happy path) — Transition: processing → success
//
// Called after responseProcessor returns a clean result.
// Actions:
//   1. INSERT into verification_results — stores the full normalised IDfy
//      response as JSONB plus the verified boolean and processed_at timestamp.
//   2. UPDATE verification_requests — sets api_status, document-level status,
//      and stamps last_api_attempt again so it reflects completion time.
//
// Why two writes?
//   verification_results is the detailed result store (one row per completed
//   verification). verification_requests is the lifecycle/status tracker.
//   Keeping them separate means GET /verifications/:id can JOIN both in one
//   query without any data duplication or ambiguity.
// ─────────────────────────────────────────────────────────────────────────────
async function setSuccess(id, processed) {
  // 1. Store the full normalised result
  await db.query(
    `INSERT INTO verification_results
       (verification_id, result_data, verified, processed_at)
     VALUES ($1, $2, $3, NOW())`,
    [id, JSON.stringify(processed), processed.verified]
  );

  // 2. Update the request's lifecycle status.
  //    api_status = 'success'  — the IDfy API call itself worked
  //    status     = 'verified' | 'failed' — did the document exist in govt DB?
  //
  //    These are two distinct concepts (see README Section 6). A PAN that
  //    isn't in NSDL has api_status='success' but status='failed', verified=false.
  await db.query(
    `UPDATE verification_requests
     SET api_status       = 'success',
         status           = $1,
         failure_reason   = NULL,
         last_api_attempt = NOW()
     WHERE id = $2`,
    [processed.verified ? "verified" : "failed", id]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// setFailed
//
// BE-9 Step 3 (error path) — Transition: processing → failed
//
// Called when the IDfy call throws (network error, auth error, account plan
// restriction, source_down, etc.).
//
// IMPORTANT — TWO fields are updated:
//   api_status     = 'failed'  — the IDfy HTTP call itself errored
//   status         = 'failed'  — the document-level outcome is also failed
//                                (there is no result, so it cannot be 'verified')
//
// Without updating `status` here it stays as whatever the INSERT defaulted to
// (typically 'pending_verification'), which fails the BE-9 test check that
// asserts status must be 'verified' | 'failed' | 'retrying'.
//
// Note: does NOT insert into verification_results — there is no result to store
// when the API call itself failed. The GET endpoint handles the NULL JOIN.
// ─────────────────────────────────────────────────────────────────────────────
async function setFailed(id, reason) {
  await db.query(
    `UPDATE verification_requests
     SET api_status       = 'failed',
         status           = 'failed',
         failure_reason   = $1,
         last_api_attempt = NOW()
     WHERE id = $2`,
    [reason, id]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// runVerificationAsync — generic background runner
//
// BE-9 core implementation. Handles the full pending → processing → success/failed
// state machine for any document type. Document-specific logic is injected via
// the `callVendor` callback so there is no duplication across PAN/Aadhaar/GSTIN.
//
// Parameters:
//   record      — the full DB row from verification_requests (RETURNING *)
//   callVendor  — async function(record) → raw IDfy response
//   docType     — 'pan' | 'aadhaar' | 'gst' — passed to responseProcessor
//   label       — display label for logs e.g. 'PAN', 'Aadhaar', 'GSTIN'
//
// State machine:
//
//   [INSERT → pending]
//          ↓  (this function starts here — HTTP 201 already sent to client)
//   [processing]  ← setProcessing()
//          ↓
//   callVendor() ← IDfy HTTP call
//          ↓
//     ┌────┴────┐
//   success   error
//     ↓         ↓
//   setSuccess  setFailed
//   (inserts    (writes failure_reason,
//    result,     sets status='failed',
//    verified)   no result row)
// ─────────────────────────────────────────────────────────────────────────────
async function runVerificationAsync(record, callVendor, docType, label) {
  const id = record.id;
  console.log(`[${label} ASYNC] ▶ Starting status tracking for record ${id}`);

  // ── Step 1: pending → processing ──────────────────────────────────────────
  try {
    console.log(`[${label} ASYNC] Step 1: pending → processing`);
    await setProcessing(id);
    console.log(`[${label} ASYNC] Step 1: done — api_status=processing, last_api_attempt stamped`);
  } catch (dbErr) {
    // If we can't even mark processing, log and abort — do not call IDfy
    console.error(`[${label} ASYNC] ❌ Failed to set processing status: ${dbErr.message}`);
    return;
  }

  // ── Step 2: call IDfy ─────────────────────────────────────────────────────
  let rawResponse;
  try {
    console.log(`[${label} ASYNC] Step 2: calling IDfy`);
    rawResponse = await callVendor(record);
    console.log(`[${label} ASYNC] Step 2: IDfy responded`);
  } catch (vendorErr) {
    // IDfy call failed — extract a human-readable reason and mark failed
    const reason = extractErrorMessage(vendorErr);
    console.error(`[${label} ASYNC] ❌ IDfy call failed: ${reason}`);
    console.error(`[${label} ASYNC] ❌ Stack: ${vendorErr.stack}`);

    try {
      await setFailed(id, reason);
      console.log(`[${label} ASYNC] processing → failed — api_status=failed, status=failed, failure_reason stored`);
    } catch (dbErr) {
      console.error(`[${label} ASYNC] ❌ Also failed to write failure to DB: ${dbErr.message}`);
    }
    return;
  }

  // ── Step 3: normalise response ────────────────────────────────────────────
  let processed;
  try {
    console.log(`[${label} ASYNC] Step 3: normalising response — docType=${docType}`);
    processed = responseProcessor.process("idfy", rawResponse, docType);
    console.log(
      `[${label} ASYNC] Step 3: done — status=${processed.status}, verified=${processed.verified}`
    );
  } catch (procErr) {
    // responseProcessor.process() never throws (it catches internally and
    // returns a failure shape), but guard here just in case
    const reason = `Response processing error: ${procErr.message}`;
    console.error(`[${label} ASYNC] ❌ ${reason}`);

    try {
      await setFailed(id, reason);
    } catch (dbErr) {
      console.error(`[${label} ASYNC] ❌ Also failed to write processing error to DB: ${dbErr.message}`);
    }
    return;
  }

  // ── Step 4: processing → success/failed ───────────────────────────────────
  try {
    console.log(`[${label} ASYNC] Step 4: writing result — verified=${processed.verified}`);
    await setSuccess(id, processed);
    console.log(
      `[${label}] ✅ Complete — record=${id}, api_status=success, ` +
      `document_status=${processed.verified ? "verified" : "failed"}, ` +
      `verified=${processed.verified}`
    );
  } catch (dbErr) {
    // The IDfy call succeeded but we couldn't write to DB — store error as failure_reason
    const reason = `DB write failed after successful IDfy call: ${dbErr.message}`;
    console.error(`[${label} ASYNC] ❌ ${reason}`);

    try {
      await setFailed(id, reason);
    } catch (innerDbErr) {
      console.error(`[${label} ASYNC] ❌ Could not write DB error either: ${innerDbErr.message}`);
    }
  }
}


/* ═════════════════════════════════════════════════════════════════════════════
   PUBLIC CONTROLLER EXPORTS
   Each create* handler:
     1. Inserts the request row (api_status = 'pending')
     2. Returns HTTP 201 immediately — client is never kept waiting
     3. Fires runVerificationAsync() without await (truly non-blocking)
═════════════════════════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/verifications/pan
// ─────────────────────────────────────────────────────────────────────────────
exports.createPanVerification = async (req, res, next) => {
  try {
    const { pan_number, full_name, dob, client_id } = req.body;

    // Insert with api_status = 'pending' — this is the very first state
    const result = await db.query(
      `INSERT INTO verification_requests
         (document_type, document_number, full_name, dob, client_id, api_status)
       VALUES ($1, $2, $3, $4, $5::uuid, 'pending')
       RETURNING *`,
      ["PAN", pan_number, full_name, dob, client_id]
    );
    const record = result.rows[0];

    // Fire-and-forget — HTTP 201 is sent before IDfy is called
    runVerificationAsync(
      record,
      (r) => thirdPartyService.verifyPAN({
        pan_number: r.document_number,
        full_name:  r.full_name,
        dob:        r.dob,
      }),
      "pan",
      "PAN"
    );

    return res.status(201).json({
      success: true,
      message: "PAN verification request created",
      data:    record,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/verifications/aadhaar
// ─────────────────────────────────────────────────────────────────────────────
exports.createAadhaarVerification = async (req, res, next) => {
  try {
    const { masked_aadhaar, full_name, client_id } = req.body;

    const result = await db.query(
      `INSERT INTO verification_requests
         (document_type, document_number, full_name, client_id, api_status)
       VALUES ($1, $2, $3, $4::uuid, 'pending')
       RETURNING *`,
      ["AADHAAR", masked_aadhaar, full_name, client_id]
    );
    const record = result.rows[0];

    runVerificationAsync(
      record,
      (r) => thirdPartyService.verifyAadhaar({
        masked_aadhaar: r.document_number,
        full_name:      r.full_name,
      }),
      "aadhaar",
      "Aadhaar"
    );

    return res.status(201).json({
      success: true,
      message: "Aadhaar verification request created",
      data:    record,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/verifications/gstin
// ─────────────────────────────────────────────────────────────────────────────
exports.createGstinVerification = async (req, res, next) => {
  try {
    const { gstin, business_name, client_id } = req.body;

    const result = await db.query(
      `INSERT INTO verification_requests
         (document_type, document_number, business_name, client_id, api_status)
       VALUES ($1, $2, $3, $4::uuid, 'pending')
       RETURNING *`,
      ["GSTIN", gstin, business_name, client_id]
    );
    const record = result.rows[0];

    runVerificationAsync(
      record,
      (r) => thirdPartyService.verifyGSTIN({
        gstin:         r.document_number,
        business_name: r.business_name,
      }),
      "gst",
      "GSTIN"
    );

    return res.status(201).json({
      success: true,
      message: "GSTIN verification request created",
      data:    record,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/verifications/retry/:id
//
// Updates retry metadata and status = 'retrying'.
// Does NOT re-call IDfy — re-verification is planned for vendorJob.js (future).
// ─────────────────────────────────────────────────────────────────────────────
exports.retryVerification = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await db.query(
      `SELECT * FROM verification_requests WHERE id = $1`,
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Verification request not found",
      });
    }

    const updated = await db.query(
      `UPDATE verification_requests
       SET retry_count   = retry_count + 1,
           last_retry_at = NOW(),
           status        = 'retrying'
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    const updatedRequest = updated.rows[0];

    // Append-only audit trail — every retry event gets its own row
    await db.query(
      `INSERT INTO verification_retry_history
         (verification_id, retry_number, retry_status, retry_reason)
       VALUES ($1, $2, $3, $4)`,
      [id, updatedRequest.retry_count, "manual_retry", "Manual retry triggered via API"]
    );

    return res.json({
      success: true,
      message: "Retry triggered successfully",
      data: {
        retry_count: updatedRequest.retry_count,
        status:      updatedRequest.status,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/verifications/:id
//
// Returns the combined request + result for a verification.
// The LEFT JOIN means this works at every stage:
//   - pending/processing  → result columns are NULL (IDfy not called yet)
//   - success             → full result_data and verified populated
//   - failed              → failure_reason populated, result columns NULL
// ─────────────────────────────────────────────────────────────────────────────
exports.getVerificationById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT
         vr.id,
         vr.document_type,
         vr.document_number,
         vr.full_name,
         vr.dob,
         vr.business_name,
         vr.client_id,
         vr.api_status,
         vr.status,
         vr.failure_reason,
         vr.retry_count,
         vr.last_retry_at,
         vr.created_at,
         vr.last_api_attempt,
         res.verified,
         res.result_data,
         res.processed_at
       FROM verification_requests vr
       LEFT JOIN verification_results res ON res.verification_id = vr.id
       WHERE vr.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Verification not found",
      });
    }

    const row = result.rows[0];

    return res.json({
      success: true,
      data: {
        id:               row.id,
        document_type:    row.document_type,
        document_number:  row.document_number,
        full_name:        row.full_name,
        dob:              row.dob,
        business_name:    row.business_name,
        client_id:        row.client_id,
        api_status:       row.api_status,
        status:           row.status,
        failure_reason:   row.failure_reason,
        retry_count:      row.retry_count,
        last_retry_at:    row.last_retry_at,
        created_at:       row.created_at,
        last_api_attempt: row.last_api_attempt,
        verified:         row.verified,
        result:           row.result_data,
        processed_at:     row.processed_at,
      },
    });
  } catch (error) {
    next(error);
  }
};