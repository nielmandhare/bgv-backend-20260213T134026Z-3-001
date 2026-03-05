console.log("✅ VERIFICATION CONTROLLER LOADED");
const db = require("../db/db");

/*
PAN Verification Intake
*/
exports.createPanVerification = async (req, res, next) => {
  try {

    const { pan_number, full_name, dob, client_id } = req.body;

    const query = `
      INSERT INTO verification_requests
      (document_type, document_number, full_name, dob, client_id)
      VALUES ($1,$2,$3,$4,$5)
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
      (document_type, document_number, full_name, client_id)
      VALUES ($1,$2,$3,$4)
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
      (document_type, document_number, business_name, client_id)
      VALUES ($1,$2,$3,$4)
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