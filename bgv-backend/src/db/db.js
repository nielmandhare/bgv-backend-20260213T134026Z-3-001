const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "bgv_platform",
  password: "mmcoe",
  port: 5432,
});

module.exports = pool;

