const db = require('../utils/db');

class VerificationResult {
  static async create(data) {
    const {
      verification_request_id,
      vendor,
      verification_type,
      status,
      verified,
      confidence_score,
      result_data,
      raw_response,
      error,
      metadata = {}
    } = data;

    const result = await db.query(
      `INSERT INTO verification_results (
        id, verification_request_id, vendor, verification_type,
        status, verified, confidence_score, result_data,
        raw_response, error, metadata, received_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW()
      ) RETURNING *`,
      [
        verification_request_id, vendor, verification_type,
        status, verified, confidence_score, JSON.stringify(result_data),
        JSON.stringify(raw_response), error, JSON.stringify(metadata)
      ]
    );

    return result.rows[0];
  }

  static async findByRequestId(verificationRequestId) {
    const result = await db.query(
      'SELECT * FROM verification_results WHERE verification_request_id = $1 ORDER BY received_at DESC',
      [verificationRequestId]
    );
    return result.rows[0];
  }
}

module.exports = VerificationResult;
