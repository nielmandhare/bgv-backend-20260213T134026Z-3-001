const BaseModel = require('./BaseModel');
const db = require('../utils/db');

class ConsentRecord extends BaseModel {
  constructor() {
    super('consent_records');
  }

  async findByUser(userId, tenantId, activeOnly = false) {
    let query = 'SELECT * FROM consent_records WHERE user_id = $1 AND tenant_id = $2';
    const params = [userId, tenantId];
    
    if (activeOnly) {
      query += ' AND is_active = true AND withdrawn_at IS NULL';
    }
    
    query += ' ORDER BY consented_at DESC';
    
    const result = await db.query(query, params);
    return result.rows;
  }

  async getLatestConsent(userId, tenantId, consentType) {
    const result = await db.query(
      `SELECT * FROM consent_records 
       WHERE user_id = $1 AND tenant_id = $2 AND consent_type = $3 AND is_active = true
       ORDER BY consented_at DESC 
       LIMIT 1`,
      [userId, tenantId, consentType]
    );
    return result.rows[0];
  }

  async hasValidConsent(userId, tenantId, consentType, maxAgeDays = 365) {
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
}

module.exports = new ConsentRecord();
