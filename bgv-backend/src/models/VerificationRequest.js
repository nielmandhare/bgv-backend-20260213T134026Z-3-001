const db = require('../utils/db');

class VerificationRequest {
  static async create(data) {
    const { tenant_id, requested_by, verification_type, input_data } = data;
    const result = await db.query(
      `INSERT INTO verification_requests (id, tenant_id, requested_by, verification_type, status, input_data) 
       VALUES (gen_random_uuid(), $1, $2, $3, 'pending', $4) RETURNING *`,
      [tenant_id, requested_by, verification_type, input_data]
    );
    return result.rows[0];
  }

  static async findByTenant(tenantId) {
    const result = await db.query(
      'SELECT * FROM verification_requests WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId]
    );
    return result.rows;
  }

  static async updateStatus(id, status, result_data = null) {
    const query = result_data
      ? 'UPDATE verification_requests SET status = $1, result_data = $2, completed_at = NOW() WHERE id = $3 RETURNING *'
      : 'UPDATE verification_requests SET status = $1 WHERE id = $2 RETURNING *';

    const params = result_data ? [status, result_data, id] : [status, id];
    const result = await db.query(query, params);
    return result.rows[0];
  }
}

module.exports = VerificationRequest;
