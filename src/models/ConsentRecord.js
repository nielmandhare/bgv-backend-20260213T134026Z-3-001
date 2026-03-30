const db = require('../utils/db');

class ConsentRecord {
  static async create(data) {
    const {
      user_id,
      tenant_id,
      verification_request_id = null,
      consent_type,
      consent_text,
      subject_name = 'User',
      version = '1.0',
      ip_address,
      user_agent = null,
      metadata = {}
    } = data;

    const result = await db.query(
      `INSERT INTO consent_records (
        id, user_id, tenant_id, verification_request_id, subject_name,
        consent_type, consent_text, version, ip_address, user_agent, metadata
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      ) RETURNING *`,
      [user_id, tenant_id, verification_request_id, subject_name, 
       consent_type, consent_text, version, ip_address, user_agent, JSON.stringify(metadata)]
    );
    return result.rows[0];
  }

  // FIXED: Correct parameter order - user_id first, then tenant_id, then consent_type
  static async getLatestConsent(userId, tenantId, consentType) {
    const result = await db.query(
      `SELECT * FROM consent_records 
       WHERE user_id = $1 AND tenant_id = $2 AND consent_type = $3 AND is_active = true
       ORDER BY consented_at DESC 
       LIMIT 1`,
      [userId, tenantId, consentType]  // ← Order: userId (UUID), tenantId (UUID), consentType (string)
    );
    return result.rows[0];
  }

  static async hasValidConsent(userId, tenantId, consentType, maxAgeDays = 365) {
    const result = await db.query(
      `SELECT EXISTS(
        SELECT 1 FROM consent_records 
        WHERE user_id = $1 AND tenant_id = $2
          AND consent_type = $3 
          AND is_active = true 
          AND consented_at > NOW() - INTERVAL '${maxAgeDays} days'
      )`,
      [userId, tenantId, consentType]
    );
    return result.rows[0].exists;
  }

  static async findByUser(userId, tenantId, activeOnly = false) {
    let query = 'SELECT * FROM consent_records WHERE user_id = $1 AND tenant_id = $2';
    const params = [userId, tenantId];
    
    if (activeOnly) {
      query += ' AND is_active = true AND withdrawn_at IS NULL';
    }
    
    query += ' ORDER BY consented_at DESC';
    
    const result = await db.query(query, params);
    return result.rows;
  }

  static async findByRequestId(verificationRequestId) {
    const result = await db.query(
      'SELECT * FROM consent_records WHERE verification_request_id = $1',
      [verificationRequestId]
    );
    return result.rows[0];
  }
}

module.exports = ConsentRecord;
