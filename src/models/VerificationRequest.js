const db = require('../utils/db');

class VerificationRequest {
  // Create a new verification request
  static async create(data) {
    const { tenant_id, requested_by, verification_type, input_data, metadata = {} } = data;
    const result = await db.query(
      `INSERT INTO verification_requests 
       (id, tenant_id, requested_by, verification_type, status, input_data, metadata) 
       VALUES (gen_random_uuid(), $1, $2, $3, 'pending', $4, $5) RETURNING *`,
      [tenant_id, requested_by, verification_type, input_data, JSON.stringify(metadata)]
    );
    return result.rows[0];
  }

  // Find by ID with tenant isolation
  static async findById(id, tenantId) {
    const result = await db.query(
      'SELECT * FROM verification_requests WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    return result.rows[0];
  }

  // Find by vendor reference ID
  static async findByVendorId(vendorReferenceId) {
    const result = await db.query(
      'SELECT * FROM verification_requests WHERE vendor_reference_id = $1',
      [vendorReferenceId]
    );
    return result.rows[0];
  }

  // Find all for tenant
  static async findByTenant(tenantId, filters = {}) {
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
    
    if (filters.limit) {
      query += ` LIMIT $${paramCount}`;
      params.push(filters.limit);
    }

    const result = await db.query(query, params);
    return result.rows;
  }

  // Update status
  static async updateStatus(id, status, result_data = null) {
    const query = result_data
      ? 'UPDATE verification_requests SET status = $1, result_data = $2, completed_at = NOW() WHERE id = $3 RETURNING *'
      : 'UPDATE verification_requests SET status = $1 WHERE id = $2 RETURNING *';

    const params = result_data ? [status, result_data, id] : [status, id];
    const result = await db.query(query, params);
    return result.rows[0];
  }

  // ========== RETRY MECHANISM METHODS ==========

  /**
   * Find requests that are ready for retry
   */
  static async findRetryEligible(limit = 50) {
    const result = await db.query(
      `SELECT * FROM verification_requests 
       WHERE status = 'failed' 
         AND retry_count < max_retries 
         AND (next_retry_at IS NULL OR next_retry_at <= NOW())
         AND deleted_at IS NULL
       ORDER BY 
         CASE WHEN next_retry_at IS NULL THEN created_at ELSE next_retry_at END ASC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  /**
   * Mark request for retry
   */
  static async scheduleRetry(id, delaySeconds, error = null) {
    const nextRetryAt = new Date(Date.now() + delaySeconds * 1000);
    
    const historyEntry = {
      attempted_at: new Date().toISOString(),
      error: error,
      next_retry_at: nextRetryAt.toISOString()
    };

    const result = await db.query(
      `UPDATE verification_requests 
       SET retry_count = retry_count + 1,
           next_retry_at = $2,
           last_error = $3,
           retry_history = retry_history || $4::jsonb,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, nextRetryAt, error, JSON.stringify([historyEntry])]
    );
    return result.rows[0];
  }

  /**
   * Mark request as permanently failed
   */
  static async markAsPermanentlyFailed(id, error) {
    const result = await db.query(
      `UPDATE verification_requests 
       SET status = 'failed',
           last_error = $2,
           retry_history = retry_history || $3::jsonb,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, error, JSON.stringify([{
        attempted_at: new Date().toISOString(),
        error: error,
        final: true
      }])]
    );
    return result.rows[0];
  }

  /**
   * Reset retry count (for manual retry)
   */
  static async resetRetryCount(id) {
    const result = await db.query(
      `UPDATE verification_requests 
       SET retry_count = 0,
           next_retry_at = NULL,
           status = 'pending',
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return result.rows[0];
  }

  /**
   * Get retry history for a request
   */
  static async getRetryHistory(id) {
    const result = await db.query(
      `SELECT retry_count, max_retries, next_retry_at, 
              last_error, retry_history
       FROM verification_requests 
       WHERE id = $1`,
      [id]
    );
    return result.rows[0];
  }

  /**
   * Update with successful retry
   */
  static async markRetrySuccess(id, resultData) {
    const result = await db.query(
      `UPDATE verification_requests 
       SET status = 'completed',
           result_data = $2,
           completed_at = NOW(),
           next_retry_at = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, resultData]
    );
    return result.rows[0];
  }

  // ========== BULK METHODS ==========

  static async findByBatchId(batchId, tenantId) {
    const result = await db.query(
      `SELECT * FROM verification_requests 
       WHERE tenant_id = $1 AND metadata->>'batch_id' = $2
       ORDER BY (metadata->>'row_number')::int ASC`,
      [tenantId, batchId]
    );
    return result.rows;
  }

  static async getBatchStats(batchId, tenantId) {
    const result = await db.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'retry_pending') as retry_pending
       FROM verification_requests 
       WHERE tenant_id = $1 AND metadata->>'batch_id' = $2`,
      [tenantId, batchId]
    );
    return result.rows[0];
  }
}

module.exports = VerificationRequest;
