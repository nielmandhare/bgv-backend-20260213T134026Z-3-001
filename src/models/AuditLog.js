const db = require('../utils/db');

class AuditLog {
  static async create(data) {
    const { 
      tenant_id, 
      user_id, 
      entity_type, 
      entity_id, 
      action, 
      old_values, 
      new_values, 
      ip_address,
      user_agent 
    } = data;

    const result = await db.query(
      `INSERT INTO audit_logs (
        tenant_id, user_id, entity_type, entity_id, action, 
        old_values, new_values, ip_address, user_agent, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) 
      RETURNING *`,
      [tenant_id, user_id, entity_type, entity_id, action, 
       old_values ? JSON.stringify(old_values) : null, 
       new_values ? JSON.stringify(new_values) : null, 
       ip_address, user_agent]
    );
    return result.rows[0];
  }

  static async findByTenant(tenantId, limit = 100) {
    const result = await db.query(
      `SELECT * FROM audit_logs 
       WHERE tenant_id = $1 
       ORDER BY timestamp DESC 
       LIMIT $2`,
      [tenantId, limit]
    );
    return result.rows;
  }

  static async findByEntity(entityType, entityId) {
    const result = await db.query(
      `SELECT * FROM audit_logs 
       WHERE entity_type = $1 AND entity_id = $2 
       ORDER BY timestamp DESC`,
      [entityType, entityId]
    );
    return result.rows;
  }

  static async findByUser(userId, limit = 50) {
    const result = await db.query(
      `SELECT * FROM audit_logs 
       WHERE user_id = $1 
       ORDER BY timestamp DESC 
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  }

  static async search(filters) {
    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (filters.tenant_id) {
      query += ` AND tenant_id = $${paramCount}`;
      params.push(filters.tenant_id);
      paramCount++;
    }

    if (filters.entity_type) {
      query += ` AND entity_type = $${paramCount}`;
      params.push(filters.entity_type);
      paramCount++;
    }

    if (filters.action) {
      query += ` AND action = $${paramCount}`;
      params.push(filters.action);
      paramCount++;
    }

    if (filters.from_date) {
      query += ` AND timestamp >= $${paramCount}`;
      params.push(filters.from_date);
      paramCount++;
    }

    if (filters.to_date) {
      query += ` AND timestamp <= $${paramCount}`;
      params.push(filters.to_date);
      paramCount++;
    }

    query += ' ORDER BY timestamp DESC LIMIT 1000';

    const result = await db.query(query, params);
    return result.rows;
  }
}

module.exports = AuditLog;
