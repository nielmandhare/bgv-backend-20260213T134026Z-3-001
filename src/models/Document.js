const BaseModel = require('./BaseModel');
const db = require('../utils/db');

class Document extends BaseModel {
  constructor() {
    super('documents');
  }

  async findByBatch(batchId, tenantId) {
    const result = await db.query(
      `SELECT * FROM documents 
       WHERE batch_id = $1 AND tenant_id = $2 
       ORDER BY row_number, created_at`,
      [batchId, tenantId]
    );
    return result.rows;
  }

  async getBatchStats(batchId, tenantId) {
    const result = await db.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'uploaded') as uploaded,
        COUNT(*) FILTER (WHERE status = 'verified') as verified,
        COUNT(*) FILTER (WHERE status = 'failed') as failed
       FROM documents 
       WHERE batch_id = $1 AND tenant_id = $2`,
      [batchId, tenantId]
    );
    return result.rows[0];
  }

  async createFromBulk(data, tenantId) {
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    
    const result = await db.query(
      `INSERT INTO documents (
        id, tenant_id, uploaded_by, verification_request_id,
        document_type, file_name, file_path, file_size, mime_type,
        batch_id, row_number, metadata, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
      RETURNING *`,
      [id, tenantId, data.uploaded_by, data.verification_request_id,
       data.document_type, data.file_name, data.file_path, data.file_size,
       data.mime_type, data.batch_id, data.row_number, data.metadata, 'uploaded']
    );
    return result.rows[0];
  }
}

module.exports = new Document();
