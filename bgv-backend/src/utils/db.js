const { Pool } = require('pg');
require('dotenv').config({ path: `.env.${process.env.NODE_ENV || 'development'}` });

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

pool.on('connect', () => {
  console.log('✅ Database connected');
});

pool.on('error', (err) => {
  console.error('❌ Database error:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
