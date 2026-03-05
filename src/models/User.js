const BaseModel = require('./BaseModel');
const db = require('../utils/db');

class User extends BaseModel {
  constructor() {
    super('users');
  }

  async findByEmail(email) {
    const result = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0];
  }

  // This method is now handled by BaseModel.findAll
  // We can keep it for custom queries if needed
  async findByTenant(tenantId, role = null) {
    let query = 'SELECT * FROM users WHERE tenant_id = $1';
    const params = [tenantId];
    
    if (role) {
      query += ' AND role = $2';
      params.push(role);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await db.query(query, params);
    return result.rows;
  }

  async findById(id, tenantId) {
    const result = await db.query(
      `SELECT * FROM users 
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    return result.rows[0];
  }
}

module.exports = new User();
