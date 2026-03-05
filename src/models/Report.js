const db = require('../utils/db');

class Report {
  static async create(data) {
    const { verification_request_id, report_number, report_path, shared_url } = data;
    const result = await db.query(
      `INSERT INTO reports (id, verification_request_id, report_number, report_path, shared_url, status) 
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'generating') RETURNING *`,
      [verification_request_id, report_number, report_path, shared_url]
    );
    return result.rows[0];
  }

  static async findByRequestId(verificationRequestId) {
    const result = await db.query('SELECT * FROM reports WHERE verification_request_id = $1', [
      verificationRequestId,
    ]);
    return result.rows[0];
  }
}

module.exports = Report;
