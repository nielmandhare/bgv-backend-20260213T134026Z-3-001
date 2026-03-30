const VerificationRequest = require('../models/VerificationRequest');
const db = require('../utils/db');  // ← ADD THIS IMPORT
const logger = require('../utils/logger');

class RetryService {
  constructor() {
    this.retryDelays = [5, 15, 45, 120];
    this.maxRetries = this.retryDelays.length;
  }

  // ... (keep all other methods)

  async getRetryStats(tenantId) {
    const result = await db.query(
      `SELECT 
        COUNT(*) FILTER (WHERE status = 'failed' AND retry_count < max_retries) as pending_retry,
        COUNT(*) FILTER (WHERE status = 'failed' AND retry_count >= max_retries) as permanently_failed,
        AVG(retry_count) FILTER (WHERE status = 'completed') as avg_retries_to_success,
        SUM(retry_count) as total_retry_attempts
       FROM verification_requests
       WHERE tenant_id = $1`,
      [tenantId]
    );
    return result.rows[0];
  }
}

module.exports = new RetryService();
