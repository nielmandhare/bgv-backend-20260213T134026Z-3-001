const db = require('../utils/db');

class ConsentRecord {
  // Create a new consent record
  static async create(data) {
    const {
      user_id,
      tenant_id,
      verification_request_id = null,
      consent_type,
      consent_text,
      version = '1.0',
      ip_address,
      user_agent = null,
      metadata = {}
    } = data;

    const result = await db.query(
      `INSERT INTO consent_records (
        id, user_id, tenant_id, verification_request_id,
        consent_type, consent_text, version, ip_address, user_agent, metadata
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9
      ) RETURNING *`,
      [user_id, tenant_id, verification_request_id, consent_type, 
       consent_text, version, ip_address, user_agent, JSON.stringify(metadata)]
    );

    return result.rows[0];
  }

  // Get consent record by ID
  static async findById(id) {
    const result = await db.query('SELECT * FROM consent_records WHERE id = $1', [id]);
    return result.rows[0];
  }

  // Get all consent records for a user
  static async findByUser(userId, activeOnly = false) {
    let query = 'SELECT * FROM consent_records WHERE user_id = $1';
    const params = [userId];
    
    if (activeOnly) {
      query += ' AND is_active = true AND withdrawn_at IS NULL';
    }
    
    query += ' ORDER BY consented_at DESC';
    
    const result = await db.query(query, params);
    return result.rows;
  }

  // Get consent records for a tenant
  static async findByTenant(tenantId, limit = 100) {
    const result = await db.query(
      `SELECT * FROM consent_records 
       WHERE tenant_id = $1 
       ORDER BY consented_at DESC 
       LIMIT $2`,
      [tenantId, limit]
    );
    return result.rows;
  }

  // Get latest consent for a user by type
  static async getLatestConsent(userId, consentType) {
    const result = await db.query(
      `SELECT * FROM consent_records 
       WHERE user_id = $1 AND consent_type = $2 AND is_active = true
       ORDER BY consented_at DESC 
       LIMIT 1`,
      [userId, consentType]
    );
    return result.rows[0];
  }

  // Check if user has given consent (within time period)
  static async hasValidConsent(userId, consentType, maxAgeDays = 365) {
    const result = await db.query(
      `SELECT EXISTS(
        SELECT 1 FROM consent_records 
        WHERE user_id = $1 
          AND consent_type = $2 
          AND is_active = true 
          AND consented_at > NOW() - INTERVAL '${maxAgeDays} days'
      )`,
      [userId, consentType]
    );
    return result.rows[0].exists;
  }

  // Withdraw consent (soft delete)
  static async withdrawConsent(id, userId) {
    const result = await db.query(
      `UPDATE consent_records 
       SET is_active = false, withdrawn_at = NOW() 
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );
    return result.rows[0];
  }

  // Get consent for a specific verification request
  static async findByRequestId(verificationRequestId) {
    const result = await db.query(
      'SELECT * FROM consent_records WHERE verification_request_id = $1',
      [verificationRequestId]
    );
    return result.rows[0];
  }

  // Get consent statistics for a tenant
  static async getStats(tenantId) {
    const result = await db.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE consent_type = 'terms') as terms_consent,
        COUNT(*) FILTER (WHERE consent_type = 'privacy') as privacy_consent,
        COUNT(*) FILTER (WHERE consent_type = 'data_processing') as data_consent,
        COUNT(*) FILTER (WHERE is_active = false) as withdrawn,
        DATE(consented_at) as date,
        COUNT(*) as daily_count
       FROM consent_records
       WHERE tenant_id = $1
       GROUP BY DATE(consented_at)
       ORDER BY date DESC
       LIMIT 30`,
      [tenantId]
    );
    return result.rows;
  }

  // Delete old consent records (for GDPR right to erasure)
  static async deleteByUser(userId) {
    const result = await db.query(
      'DELETE FROM consent_records WHERE user_id = $1 RETURNING id',
      [userId]
    );
    return result.rows;
  }
}

module.exports = ConsentRecord;
