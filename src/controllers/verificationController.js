console.log("✅ VERIFICATION CONTROLLER LOADED");

const db                = require("../utils/db");
const thirdPartyService = require("../services/thirdPartyService");
const responseProcessor = require("../services/responseProcessor");

// ─────────────────────────────────────────────────────────────────────────────
// extractErrorMessage
//
// Axios errors have the real message buried in error.response.data.
// Without this, failure_reason gets the generic "Request failed with status
// code 404" string instead of IDfy's actual { error, message } payload.
//
// Priority:
//   1. IDfy's own error body  → e.g. "NOT_FOUND: Bad Request"
//   2. Axios message          → e.g. "Request failed with status code 404"
//   3. Fallback               → "Unknown error"
// ─────────────────────────────────────────────────────────────────────────────
function extractErrorMessage(err) {
  const data = err?.response?.data;
  if (data) {
    // IDfy returns { error: 'NOT_FOUND', message: 'Bad Request' }
    if (data.error && data.message) return `${data.error}: ${data.message}`;
    if (data.message)               return data.message;
    if (typeof data === 'string')   return data;
    return JSON.stringify(data);
  }
  return err.message || 'Unknown error';
}

/* ─────────────────────────────────────────────────────────────
   INTERNAL HELPER — runs AFTER the HTTP response is sent.
───────────────────────────────────────────────────────────── */
async function runPanVerificationAsync(record) {
  const id = record.id;
  console.log(`[PAN ASYNC] ▶ Starting for record ${id}`);

  try {
    console.log(`[PAN ASYNC] Step 1: marking processing`);
    await db.query(
      `UPDATE verification_requests
       SET api_status = 'processing', last_api_attempt = NOW()
       WHERE id = $1`,
      [id]
    );
    console.log(`[PAN ASYNC] Step 1: done`);

    console.log(`[PAN ASYNC] Step 2: calling IDfy`);
    const rawResponse = await thirdPartyService.verifyPAN({
      pan_number: record.document_number,
      full_name:  record.full_name,
      dob:        record.dob
    });
    console.log(`[PAN ASYNC] Step 2: IDfy returned`);

    console.log(`[PAN ASYNC] Step 3: calling responseProcessor`);
    const processed = responseProcessor.process('idfy', rawResponse, 'pan');
    console.log(`[PAN ASYNC] Step 3: processed — status=${processed.status}, verified=${processed.verified}`);

    console.log(`[PAN ASYNC] Step 4: inserting into verification_results`);
    await db.query(
      `INSERT INTO verification_results
         (verification_id, result_data, verified, processed_at)
       VALUES ($1, $2, $3, NOW())`,
      [id, JSON.stringify(processed), processed.verified]
    );
    console.log(`[PAN ASYNC] Step 4: insert done`);

    console.log(`[PAN ASYNC] Step 5: updating final status`);
    await db.query(
      `UPDATE verification_requests
       SET api_status = $1,
           status     = $2
       WHERE id = $3`,
      [processed.status, processed.verified ? 'verified' : 'failed', id]
    );
    console.log(`[PAN ASYNC] Step 5: done`);

    console.log(`[PAN] ✅ Completed for record ${id} — api_status=${processed.status}`);

  } catch (err) {
    const reason = extractErrorMessage(err);
    console.error(`[PAN] ❌ Failed for record ${id}: ${reason}`);
    console.error(`[PAN] ❌ Stack: ${err.stack}`);
    await db.query(
      `UPDATE verification_requests
       SET api_status     = 'failed',
           failure_reason = $1
       WHERE id = $2`,
      [reason, id]
    ).catch(dbErr => {
      console.error('[PAN] ❌ Also failed to write failure_reason to DB:', dbErr.message);
    });
  }
}

async function runAadhaarVerificationAsync(record) {
  const id = record.id;
  console.log(`[Aadhaar ASYNC] ▶ Starting for record ${id}`);

  try {
    console.log(`[Aadhaar ASYNC] Step 1: marking processing`);
    await db.query(
      `UPDATE verification_requests
       SET api_status = 'processing', last_api_attempt = NOW()
       WHERE id = $1`, [id]
    );

    console.log(`[Aadhaar ASYNC] Step 2: calling IDfy — endpoint: ind_aadhaar`);
    const rawResponse = await thirdPartyService.verifyAadhaar({
      masked_aadhaar: record.document_number,
      full_name:      record.full_name
    });
    console.log(`[Aadhaar ASYNC] Step 2: IDfy returned`);

    console.log(`[Aadhaar ASYNC] Step 3: processing response`);
    const processed = responseProcessor.process('idfy', rawResponse, 'aadhaar');
    console.log(`[Aadhaar ASYNC] Step 3: done — status=${processed.status}, verified=${processed.verified}`);

    console.log(`[Aadhaar ASYNC] Step 4: inserting result`);
    await db.query(
      `INSERT INTO verification_results (verification_id, result_data, verified, processed_at)
       VALUES ($1, $2, $3, NOW())`,
      [id, JSON.stringify(processed), processed.verified]
    );

    console.log(`[Aadhaar ASYNC] Step 5: updating final status`);
    await db.query(
      `UPDATE verification_requests SET api_status = $1, status = $2 WHERE id = $3`,
      [processed.status, processed.verified ? 'verified' : 'failed', id]
    );

    console.log(`[Aadhaar] ✅ Completed for record ${id} — api_status=${processed.status}, verified=${processed.verified}`);

  } catch (err) {
    // extractErrorMessage pulls IDfy's { error, message } body out of the
    // axios error so failure_reason is "NOT_FOUND: Bad Request" not the
    // generic axios string.
    const reason = extractErrorMessage(err);
    console.error(`[Aadhaar] ❌ Failed for record ${id}: ${reason}`);
    await db.query(
      `UPDATE verification_requests SET api_status = 'failed', failure_reason = $1 WHERE id = $2`,
      [reason, id]
    ).catch(() => {});
  }
}

async function runGstinVerificationAsync(record) {
  const id = record.id;
  console.log(`[GSTIN ASYNC] ▶ Starting for record ${id}`);

  try {
    console.log(`[GSTIN ASYNC] Step 1: marking processing`);
    await db.query(
      `UPDATE verification_requests
       SET api_status = 'processing', last_api_attempt = NOW()
       WHERE id = $1`, [id]
    );

    console.log(`[GSTIN ASYNC] Step 2: calling IDfy`);
    const rawResponse = await thirdPartyService.verifyGSTIN({
      gstin:         record.document_number,
      business_name: record.business_name
    });
    console.log(`[GSTIN ASYNC] Step 2: IDfy returned`);

    console.log(`[GSTIN ASYNC] Step 3: processing response`);
    const processed = responseProcessor.process('idfy', rawResponse, 'gst');
    console.log(`[GSTIN ASYNC] Step 3: done — status=${processed.status}, verified=${processed.verified}`);

    console.log(`[GSTIN ASYNC] Step 4: inserting result`);
    await db.query(
      `INSERT INTO verification_results (verification_id, result_data, verified, processed_at)
       VALUES ($1, $2, $3, NOW())`,
      [id, JSON.stringify(processed), processed.verified]
    );

    console.log(`[GSTIN ASYNC] Step 5: updating final status`);
    await db.query(
      `UPDATE verification_requests SET api_status = $1, status = $2 WHERE id = $3`,
      [processed.status, processed.verified ? 'verified' : 'failed', id]
    );

    console.log(`[GSTIN] ✅ Completed for record ${id}`);

  } catch (err) {
    const reason = extractErrorMessage(err);
    console.error(`[GSTIN] ❌ Failed for record ${id}: ${reason}`);
    await db.query(
      `UPDATE verification_requests SET api_status = 'failed', failure_reason = $1 WHERE id = $2`,
      [reason, id]
    ).catch(() => {});
  }
}


/* ═════════════════════════════════════════════════════════════
   PUBLIC CONTROLLER EXPORTS
═════════════════════════════════════════════════════════════ */

exports.createPanVerification = async (req, res, next) => {
  try {
    const { pan_number, full_name, dob, client_id } = req.body;
    const result = await db.query(
      `INSERT INTO verification_requests
         (document_type, document_number, full_name, dob, client_id, api_status)
       VALUES ($1, $2, $3, $4, $5::uuid, 'pending')
       RETURNING *`,
      ["PAN", pan_number, full_name, dob, client_id]
    );
    const record = result.rows[0];
    runPanVerificationAsync(record);
    return res.status(201).json({ success: true, message: "PAN verification request created", data: record });
  } catch (error) { next(error); }
};

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
    runAadhaarVerificationAsync(record);
    return res.status(201).json({ success: true, message: "Aadhaar verification request created", data: record });
  } catch (error) { next(error); }
};

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
    runGstinVerificationAsync(record);
    return res.status(201).json({ success: true, message: "GSTIN verification request created", data: record });
  } catch (error) { next(error); }
};

exports.retryVerification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const verification = await db.query(
      `SELECT * FROM verification_requests WHERE id = $1`, [id]
    );
    if (verification.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Verification request not found" });
    }
    const updated = await db.query(
      `UPDATE verification_requests
       SET retry_count = retry_count + 1, last_retry_at = NOW(), status = 'retrying'
       WHERE id = $1 RETURNING *`,
      [id]
    );
    const updatedRequest = updated.rows[0];
    await db.query(
      `INSERT INTO verification_retry_history
         (verification_id, retry_number, retry_status, retry_reason)
       VALUES ($1, $2, $3, $4)`,
      [id, updatedRequest.retry_count, "manual_retry", "Manual retry triggered via API"]
    );
    return res.json({ success: true, message: "Retry triggered successfully", data: updatedRequest });
  } catch (error) { next(error); }
};

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
         vr.api_status,
         vr.status,
         vr.failure_reason,
         vr.retry_count,
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
      return res.status(404).json({ success: false, message: "Verification not found" });
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
        api_status:       row.api_status,
        status:           row.status,
        failure_reason:   row.failure_reason,
        retry_count:      row.retry_count,
        created_at:       row.created_at,
        last_api_attempt: row.last_api_attempt,
        verified:         row.verified,
        result:           row.result_data,
        processed_at:     row.processed_at,
      }
    });

  } catch (error) { next(error); }
};