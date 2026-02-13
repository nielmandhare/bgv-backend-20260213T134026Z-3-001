const db = require('../utils/db');

class User {
  static async findAll() {
    const result = await db.query(`
      SELECT users.id, users.email, users.role, users.is_active, users.created_at,
             tenants.id as tenant_id, tenants.name as tenant_name
      FROM users 
      JOIN tenants ON users.tenant_id = tenants.id
      WHERE users.is_active = true
    `);
    return result.rows;
  }

  static async findById(id) {
    const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0];
  }

  static async findByEmail(email) {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0];
  }

  static async create(data) {
    const { tenant_id, email, password_hash, role = 'client_user' } = data;
    const result = await db.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, role) 
       VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id, email, role, created_at`,
      [tenant_id, email, password_hash, role]
    );
    return result.rows[0];
  }
}

module.exports = User;
