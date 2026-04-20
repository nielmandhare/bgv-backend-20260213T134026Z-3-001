const BaseModel = require('./BaseModel');
const db = require('../utils/db');

class VerificationRequest extends BaseModel {
  constructor() {
    super('verification_requests');
  }

  async create(data) {
    const { tenant_id, requested_by, verification_type, input_data } = data;
    const result = await db.query(
      `INSERT INTO verification_requests (id, tenant_id, requested_by, verification_type, status, input_data)
       VALUES (gen_random_uuid(), $1, $2, $3, 'pending', $4) RETURNING *`,
      [tenant_id, requested_by, verification_type, input_data]
    );
    return result.rows[0];
  }

  async findByTenant(tenantId, filters = {}) {
    let query = 'SELECT * FROM verification_requests WHERE tenant_id = $1';
    const params = [tenantId];
    let paramCount = 2;

    if (filters.status) {
      query += ` AND status = $${paramCount}`;
      params.push(filters.status);
      paramCount++;
    }

    if (filters.type) {
      query += ` AND verification_type = $${paramCount}`;
      params.push(filters.type);
      paramCount++;
    }

    query += ' ORDER BY created_at DESC';

    const result = await db.query(query, params);
    return result.rows;
  }

  async updateStatus(id, status, resultData = null, tenantId) {
    const exists = await this.exists(id, tenantId);
    if (!exists) {
      throw new Error('Access denied');
    }

    const query = resultData
      ? 'UPDATE verification_requests SET status = $1, result_data = $2, completed_at = NOW() WHERE id = $3 RETURNING *'
      : 'UPDATE verification_requests SET status = $1 WHERE id = $2 RETURNING *';

    const params = resultData ? [status, resultData, id] : [status, id];
    const result = await db.query(query, params);
    return result.rows[0];
  }
}

module.exports = new VerificationRequest();