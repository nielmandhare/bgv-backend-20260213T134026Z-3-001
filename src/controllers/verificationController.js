console.log("✅ VERIFICATION CONTROLLER LOADED");
const db = require("../utils/db");

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

    const values = [
      "PAN",
      pan_number,
      full_name,
      dob,
      client_id
    ];

    const result = await db.query(query, values);

    res.status(201).json({
      success: true,
      message: "PAN verification request created",
      data: result.rows[0]
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

    const values = [
      "AADHAAR",
      masked_aadhaar,
      full_name,
      client_id
    ];

    const result = await db.query(query, values);

    res.status(201).json({
      success: true,
      message: "Aadhaar verification request created",
      data: result.rows[0]
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

    const values = [
      "GSTIN",
      gstin,
      business_name,
      client_id
    ];

    const result = await db.query(query, values);

    res.status(201).json({
      success: true,
      message: "GSTIN verification request created",
      data: result.rows[0]
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

    // 1️⃣ Find verification request
    const verification = await db.query(
      `SELECT * FROM verification_requests WHERE id = $1`,
      [id]
    );

    if (verification.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Verification request not found"
      });
    }

    // 2️⃣ Update retry fields
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

    // 3️⃣ Log retry history
    await db.query(
      `INSERT INTO verification_retry_history
       (verification_id, retry_number, retry_status, retry_reason)
       VALUES ($1,$2,$3,$4)`,
      [
        id,
        updatedRequest.retry_count,
        "manual_retry",
        "Manual retry triggered via API"
      ]
    );

    // 4️⃣ Send response
    res.json({
      success: true,
      message: "Retry triggered successfully",
      data: updatedRequest
    });

  } catch (error) {
    next(error);
  }
};