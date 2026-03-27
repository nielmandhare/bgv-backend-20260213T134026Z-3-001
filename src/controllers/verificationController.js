console.log("✅ VERIFICATION CONTROLLER LOADED");

const db = require("../utils/db");
const thirdPartyService = require("../services/thirdPartyService");

/*
PAN Verification Intake
*/
exports.createPanVerification = async (req, res, next) => {
  try {
    const { pan_number, full_name, dob, client_id } = req.body;

    const query = `
      INSERT INTO verification_requests
      (document_type, document_number, full_name, dob, client_id, api_status)
      VALUES ($1,$2,$3,$4,$5::uuid,'pending')
      RETURNING *
    `;

    const values = ["PAN", pan_number, full_name, dob, client_id];

    const result = await db.query(query, values);
    const createdRecord = result.rows[0];

    // 🔥 NON-BLOCKING API CALL
    thirdPartyService
      .verifyPAN({
        pan_number,
        full_name,
        dob,
      })
      .then(async () => {
        await db.query(
          `UPDATE verification_requests 
           SET api_status = 'processing', last_api_attempt = NOW()
           WHERE id = $1`,
          [createdRecord.id]
        );
      })
      .catch(async (err) => {
        console.error("PAN API failed:", err.message);

        await db.query(
          `UPDATE verification_requests 
           SET api_status = 'failed', failure_reason = $1
           WHERE id = $2`,
          [err.message, createdRecord.id]
        );
      });

    res.status(201).json({
      success: true,
      message: "PAN verification request created",
      data: createdRecord,
    });
  } catch (error) {
    next(error);
  }
};

/*
Aadhaar Verification Intake
*/
exports.createAadhaarVerification = async (req, res, next) => {
  try {
    const { masked_aadhaar, full_name, client_id } = req.body;

    const query = `
      INSERT INTO verification_requests
      (document_type, document_number, full_name, client_id, api_status)
      VALUES ($1,$2,$3,$4::uuid,'pending')
      RETURNING *
    `;

    const values = ["AADHAAR", masked_aadhaar, full_name, client_id];

    const result = await db.query(query, values);
    const createdRecord = result.rows[0];

    // 🔥 NON-BLOCKING API CALL
    thirdPartyService
      .verifyAadhaar({
        masked_aadhaar,
        full_name,
      })
      .then(async () => {
        await db.query(
          `UPDATE verification_requests 
           SET api_status = 'processing', last_api_attempt = NOW()
           WHERE id = $1`,
          [createdRecord.id]
        );
      })
      .catch(async (err) => {
        console.error("Aadhaar API failed:", err.message);

        await db.query(
          `UPDATE verification_requests 
           SET api_status = 'failed', failure_reason = $1
           WHERE id = $2`,
          [err.message, createdRecord.id]
        );
      });

    res.status(201).json({
      success: true,
      message: "Aadhaar verification request created",
      data: createdRecord,
    });
  } catch (error) {
    next(error);
  }
};

/*
GSTIN Verification Intake
*/
exports.createGstinVerification = async (req, res, next) => {
  try {
    const { gstin, business_name, client_id } = req.body;

    const query = `
      INSERT INTO verification_requests
      (document_type, document_number, business_name, client_id, api_status)
      VALUES ($1,$2,$3,$4::uuid,'pending')
      RETURNING *
    `;

    const values = ["GSTIN", gstin, business_name, client_id];

    const result = await db.query(query, values);
    const createdRecord = result.rows[0];

    // 🔥 NON-BLOCKING API CALL
    thirdPartyService
      .verifyGSTIN({
        gstin,
        business_name,
      })
      .then(async () => {
        await db.query(
          `UPDATE verification_requests 
           SET api_status = 'processing', last_api_attempt = NOW()
           WHERE id = $1`,
          [createdRecord.id]
        );
      })
      .catch(async (err) => {
        console.error("GSTIN API failed:", err.message);

        await db.query(
          `UPDATE verification_requests 
           SET api_status = 'failed', failure_reason = $1
           WHERE id = $2`,
          [err.message, createdRecord.id]
        );
      });

    res.status(201).json({
      success: true,
      message: "GSTIN verification request created",
      data: createdRecord,
    });
  } catch (error) {
    next(error);
  }
};

/*
Manual Retry Verification
*/
exports.retryVerification = async (req, res, next) => {
  try {
    const { id } = req.params;

    const verification = await db.query(
      `SELECT * FROM verification_requests WHERE id = $1`,
      [id]
    );

    if (verification.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Verification request not found",
      });
    }

    const updated = await db.query(
      `UPDATE verification_requests
       SET retry_count = retry_count + 1,
           last_retry_at = NOW(),
           status = 'retrying'
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    const updatedRequest = updated.rows[0];

    await db.query(
      `INSERT INTO verification_retry_history
       (verification_id, retry_number, retry_status, retry_reason)
       VALUES ($1,$2,$3,$4)`,
      [
        id,
        updatedRequest.retry_count,
        "manual_retry",
        "Manual retry triggered via API",
      ]
    );

    res.json({
      success: true,
      message: "Retry triggered successfully",
      data: updatedRequest,
    });
  } catch (error) {
    next(error);
  }
};