const db = require('../utils/db');

class Tenant {
  static async findAll() {
    const result = await db.query('SELECT * FROM tenants WHERE is_active = true');
    return result.rows;
  }

  static async findById(id) {
    const result = await db.query('SELECT * FROM tenants WHERE id = $1', [id]);
    return result.rows[0];
  }

  static async create(data) {
    const { name, tier = 'basic' } = data;
    const result = await db.query(
      'INSERT INTO tenants (id, name, tier) VALUES (gen_random_uuid(), $1, $2) RETURNING *',
      [name, tier]
    );
    return result.rows[0];
  }
}

module.exports = Tenant;
