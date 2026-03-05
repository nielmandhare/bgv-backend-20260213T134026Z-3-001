const db = require('../utils/db');
const { v4: uuidv4 } = require('uuid');

class Document {
  // Create a new document
  static async create(data) {
    const {
      tenant_id,
      uploaded_by,
      verification_request_id,
      document_type,
      file_name,
      file_path,
      file_size,
      mime_type,
      status = 'uploaded'
    } = data;

    const id = uuidv4();
    
    const result = await db.query(
      `INSERT INTO documents (
        id, tenant_id, uploaded_by, verification_request_id,
        document_type, file_name, file_path, file_size, mime_type, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
      RETURNING *`,
      [id, tenant_id, uploaded_by, verification_request_id,
       document_type, file_name, file_path, file_size, mime_type, status]
    );
    return result.rows[0];
  }

  // Find document by ID
  static async findById(id) {
    const result = await db.query('SELECT * FROM documents WHERE id = $1', [id]);
    return result.rows[0];
  }

  // Find documents by tenant
  static async findByTenant(tenantId) {
    const result = await db.query(
      'SELECT * FROM documents WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId]
    );
    return result.rows;
  }

  // Update document status
  static async updateStatus(id, status) {
    const result = await db.query(
      'UPDATE documents SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    return result.rows[0];
  }

  // ========== BULK UPLOAD METHODS ==========
  
  // Create document from bulk upload
  static async createFromBulk(data) {
    const {
      tenant_id, 
      uploaded_by, 
      verification_request_id, 
      document_type,
      file_name, 
      file_path, 
      file_size, 
      mime_type, 
      batch_id, 
      row_number, 
      metadata = {}
    } = data;

    const id = uuidv4();
    
    const result = await db.query(
      `INSERT INTO documents (
        id, tenant_id, uploaded_by, verification_request_id,
        document_type, file_name, file_path, file_size, mime_type,
        batch_id, row_number, metadata, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
      RETURNING *`,
      [id, tenant_id, uploaded_by, verification_request_id,
       document_type, file_name, file_path, file_size, mime_type,
       batch_id, row_number, metadata, 'uploaded']
    );
    return result.rows[0];
  }

  // Find documents by batch ID
  static async findByBatch(batchId) {
    const result = await db.query(
      `SELECT * FROM documents 
       WHERE batch_id = $1 
       ORDER BY row_number, created_at`,
      [batchId]
    );
    return result.rows;
  }

  // Get batch statistics
  static async getBatchStats(batchId) {
    const result = await db.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'uploaded') as uploaded,
        COUNT(*) FILTER (WHERE status = 'verified') as verified,
        COUNT(*) FILTER (WHERE status = 'failed') as failed
       FROM documents 
       WHERE batch_id = $1`,
      [batchId]
    );
    return result.rows[0];
  }

  // Get documents by verification request
  static async findByVerificationRequest(verificationRequestId) {
    const result = await db.query(
      'SELECT * FROM documents WHERE verification_request_id = $1',
      [verificationRequestId]
    );
    return result.rows;
  }

  // Soft delete document
  static async softDelete(id) {
    const result = await db.query(
      'UPDATE documents SET deleted_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  }
}

module.exports = Document;