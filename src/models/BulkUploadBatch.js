const db = require('../utils/db');
const { v4: uuidv4 } = require('uuid');

class BulkUploadBatch {
  static async create(data) {
    const { tenant_id, uploaded_by, file_name, total_rows = 0, metadata = {} } = data;
    const id = uuidv4();
    const batchId = `BATCH-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const result = await db.query(
      `INSERT INTO bulk_upload_batches (
        id, tenant_id, uploaded_by, file_name, total_rows, 
        successful_rows, failed_rows, status, metadata, batch_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [id, tenant_id, uploaded_by, file_name, total_rows, 0, 0, 'uploaded', metadata, batchId]
    );
    return result.rows[0];
  }

  static async updateProgress(id, successful, failed, status = null) {
    let query = `UPDATE bulk_upload_batches SET successful_rows = successful_rows + $2, failed_rows = failed_rows + $3`;
    const params = [id, successful, failed];
    let paramCount = 4;

    if (status) {
      query += `, status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }
    if (status === 'completed' || status === 'failed') {
      query += `, completed_at = NOW()`;
    }
    query += ` WHERE id = $1 RETURNING *`;
    const result = await db.query(query, params);
    return result.rows[0];
  }

  static async startProcessing(id) {
    const result = await db.query(
      `UPDATE bulk_upload_batches SET status = 'processing', started_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0];
  }

  static async completeWithErrors(id, errorFileUrl) {
    const result = await db.query(
      `UPDATE bulk_upload_batches SET status = 'partially_failed', error_file_url = $2, completed_at = NOW() WHERE id = $1 RETURNING *`,
      [id, errorFileUrl]
    );
    return result.rows[0];
  }

  static async findById(id) {
    const result = await db.query('SELECT * FROM bulk_upload_batches WHERE id = $1', [id]);
    return result.rows[0];
  }

  static async findByTenant(tenantId, limit = 20) {
    const result = await db.query(
      `SELECT * FROM bulk_upload_batches WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [tenantId, limit]
    );
    return result.rows;
  }

  static async getStats(tenantId) {
    const result = await db.query(
      `SELECT COUNT(*) as total_batches,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(total_rows) as total_records,
        SUM(successful_rows) as successful_records,
        SUM(failed_rows) as failed_records
       FROM bulk_upload_batches WHERE tenant_id = $1`,
      [tenantId]
    );
    return result.rows[0];
  }
}

module.exports = BulkUploadBatch;
