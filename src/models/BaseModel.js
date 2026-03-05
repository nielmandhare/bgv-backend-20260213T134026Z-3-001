const db = require('../utils/db');

class BaseModel {
  constructor(tableName) {
    this.tableName = tableName;
  }

  async findAll(tenantId, options = {}) {
    const { limit = 100, offset = 0, orderBy = 'created_at', orderDir = 'DESC' } = options;
    
    // FIXED: WHERE clause comes before ORDER BY
    const result = await db.tenantQuery(
      `SELECT * FROM ${this.tableName} 
       WHERE tenant_id = $1
       ORDER BY ${orderBy} ${orderDir} 
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset],
      tenantId  // This parameter is used by tenantQuery, not in the query itself
    );
    
    return result.rows;
  }

  async findById(id, tenantId) {
    const result = await db.query(
      `SELECT * FROM ${this.tableName} 
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    
    return result.rows[0];
  }

  async create(data, tenantId, userId = null) {
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    
    const recordData = {
      id,
      tenant_id: tenantId,
      ...data,
      created_at: new Date(),
      updated_at: new Date()
    };

    if (userId) {
      recordData.created_by = userId;
    }

    const keys = Object.keys(recordData);
    const values = Object.values(recordData);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    
    const query = `INSERT INTO ${this.tableName} (${keys.join(', ')}) 
                   VALUES (${placeholders}) RETURNING *`;

    const result = await db.query(query, values);
    return result.rows[0];
  }

  async update(id, data, tenantId) {
    // First verify ownership
    const exists = await this.findById(id, tenantId);
    if (!exists) {
      throw new Error('Record not found or access denied');
    }

    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
    
    const query = `UPDATE ${this.tableName} 
                   SET ${setClause}, updated_at = NOW() 
                   WHERE id = $1 AND tenant_id = $${keys.length + 2}
                   RETURNING *`;

    const result = await db.query(query, [id, ...values, tenantId]);
    return result.rows[0];
  }

  async delete(id, tenantId, softDelete = true) {
    // First verify ownership
    const exists = await this.findById(id, tenantId);
    if (!exists) {
      throw new Error('Record not found or access denied');
    }

    if (softDelete) {
      const result = await db.query(
        `UPDATE ${this.tableName} 
         SET deleted_at = NOW() 
         WHERE id = $1 AND tenant_id = $2 
         RETURNING id`,
        [id, tenantId]
      );
      return result.rows[0];
    } else {
      const result = await db.query(
        `DELETE FROM ${this.tableName} 
         WHERE id = $1 AND tenant_id = $2 
         RETURNING id`,
        [id, tenantId]
      );
      return result.rows[0];
    }
  }

  async exists(id, tenantId) {
    const result = await db.query(
      `SELECT EXISTS(SELECT 1 FROM ${this.tableName} 
       WHERE id = $1 AND tenant_id = $2)`,
      [id, tenantId]
    );
    return result.rows[0].exists;
  }
}

module.exports = BaseModel;
