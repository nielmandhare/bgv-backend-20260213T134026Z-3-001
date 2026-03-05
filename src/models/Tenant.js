const BaseModel = require('./BaseModel');
const db = require('../utils/db');

class Tenant extends BaseModel {
  constructor() {
    super('tenants');
  }

  async findAll() {
    const result = await db.query('SELECT * FROM tenants WHERE is_active = true');
    return result.rows;
  }

  async findById(id) {
    const result = await db.query('SELECT * FROM tenants WHERE id = $1', [id]);
    return result.rows[0];
  }

  async validateTenant(tenantId) {
    const result = await db.query(
      'SELECT EXISTS(SELECT 1 FROM tenants WHERE id = $1 AND is_active = true)',
      [tenantId]
    );
    return result.rows[0].exists;
  }
}

module.exports = new Tenant();
