const BaseModel = require('./BaseModel');
const db = require('../utils/db');

class User extends BaseModel {
  constructor() {
    super('users');
  }

  async findAll() {
    const result = await db.query(`
      SELECT users.id, users.email, users.role, users.is_active, users.created_at,
             tenants.id as tenant_id, tenants.name as tenant_name
      FROM users
      JOIN tenants ON users.tenant_id = tenants.id
      WHERE users.is_active = true
    `);
    return result.rows;
  }

  async findById(id, tenantId = null) {
    // if tenantId provided, scope to tenant (new behaviour)
    // if not, just find by id (old behaviour) — prevents breaking old callers
    const query = tenantId
      ? 'SELECT * FROM users WHERE id = $1 AND tenant_id = $2'
      : 'SELECT * FROM users WHERE id = $1';
    const params = tenantId ? [id, tenantId] : [id];
    const result = await db.query(query, params);
    return result.rows[0];
  }

  async findByEmail(email) {
    const result = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0];
  }

  async create(data) {
    const { tenant_id, email, password_hash, role = 'client_user' } = data;
    const result = await db.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, role)
       VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id, email, role, created_at`,
      [tenant_id, email, password_hash, role]
    );
    return result.rows[0];
  }

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
}

module.exports = new User();