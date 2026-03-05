const BaseModel = require('./BaseModel');
const db = require('../utils/db');

class BulkUploadBatch extends BaseModel {
  constructor() {
    super('bulk_upload_batches');
  }

  async findByTenant(tenantId, limit = 20) {
    const result = await db.query(
      `SELECT * FROM bulk_upload_batches 
       WHERE tenant_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [tenantId, limit]
    );
    return result.rows;
  }

  async getStats(tenantId) {
    const result = await db.query(
      `SELECT 
        COUNT(*) as total_batches,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(total_rows) as total_records,
        SUM(successful_rows) as successful_records,
        SUM(failed_rows) as failed_records
       FROM bulk_upload_batches 
       WHERE tenant_id = $1`,
      [tenantId]
    );
    return result.rows[0];
  }
}

module.exports = new BulkUploadBatch();
