const { Pool } = require('pg');
const logger = require('./logger');
require('dotenv').config({ path: `.env.${process.env.NODE_ENV || 'development'}` });

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

pool.on('connect', () => {
  logger.info('✅ Database connected');
});

pool.on('error', (err) => {
  logger.error('❌ Database error:', err);
});

const query = async (text, params = []) => {
  const start = Date.now();
  
  try {
    if (process.env.NODE_ENV === 'development') {
      logger.debug(`📝 SQL: ${text.substring(0, 200)}...`);
    }

    const result = await pool.query(text, params);
    
    const duration = Date.now() - start;
    if (duration > 1000) {
      logger.warn(`🐢 Slow query (${duration}ms): ${text.substring(0, 100)}...`);
    }
    
    return result;
  } catch (error) {
    logger.error(`❌ Query error: ${error.message}`);
    throw error;
  }
};

const tenantQuery = async (text, params = [], tenantId) => {
  if (!tenantId) {
    throw new Error('tenantId is required for tenantQuery');
  }

  if (text.trim().toUpperCase().startsWith('SELECT')) {
    if (!text.includes('tenant_id')) {
      if (text.includes('WHERE')) {
        text = text.replace('WHERE', `WHERE tenant_id = $${params.length + 1} AND `);
      } else {
        text = `${text} WHERE tenant_id = $${params.length + 1}`;
      }
      params.push(tenantId);
    }
  }

  return query(text, params);
};

const verifyTenantOwnership = async (table, id, tenantId) => {
  const result = await pool.query(
    `SELECT EXISTS(SELECT 1 FROM ${table} WHERE id = $1 AND tenant_id = $2)`,
    [id, tenantId]
  );
  return result.rows[0].exists;
};

module.exports = {
  query,
  tenantQuery,
  verifyTenantOwnership,
  pool,
};
