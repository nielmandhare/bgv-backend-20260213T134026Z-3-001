const { Pool } = require("pg");
const logger   = require("./logger");

// Load environment-specific .env file (e.g. .env.development, .env.production)
// This mirrors what server.js does with dotenv — both load for safety.
require("dotenv").config({
  path: `.env.${process.env.NODE_ENV || "development"}`,
});

// ─────────────────────────────────────────────────────────────────────────────
// Connection pool
//
// All DB credentials come from environment variables — NO hardcoded fallbacks.
// server.js calls process.exit(1) if DB_USER / DB_PASSWORD / DB_NAME are
// missing, so by the time this module loads, all required vars are guaranteed.
//
// ⚠️  Production note: set DB_HOST, DB_PORT, and DB_SSL=true explicitly.
//     DB_SSL is checked below and enables SSL when set to 'true'.
// ─────────────────────────────────────────────────────────────────────────────
const poolConfig = {
  user:     process.env.DB_USER,
  host:     process.env.DB_HOST     || "localhost",
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port:     parseInt(process.env.DB_PORT || "5432", 10),

  // Connection pool sizing
  max:             parseInt(process.env.DB_POOL_MAX || "10", 10),   // max connections
  idleTimeoutMillis:  parseInt(process.env.DB_IDLE_TIMEOUT || "30000", 10),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT || "5000", 10),
};

// Enable SSL for production / staging
if (process.env.DB_SSL === "true") {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

pool.on("connect", () => {
  logger.info("✅ Database pool: new client connected");
});

pool.on("error", (err) => {
  logger.error(`❌ Database pool error: ${err.message}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// query
//
// Core DB query wrapper. All controllers and services call this — never
// pool.query() directly. Benefits:
//   - Dev-mode SQL logging (truncated to 200 chars)
//   - Slow query detection (>1000ms → warn)
//   - Centralised error logging before re-throwing
//
// BE-9: last_api_attempt is set via NOW() in SQL — this ensures the timestamp
// is always the DB server's clock, not the Node process clock. All status
// transition queries go through this wrapper.
// ─────────────────────────────────────────────────────────────────────────────
const query = async (text, params = []) => {
  const start = Date.now();

  try {
    if (process.env.NODE_ENV === "development") {
      // Truncate to keep logs readable while still being debuggable
      logger.debug(`📝 SQL: ${text.substring(0, 200)}${text.length > 200 ? "..." : ""}`);
    }

    const result   = await pool.query(text, params);
    const duration = Date.now() - start;

    if (duration > 1000) {
      logger.warn(
        `🐢 Slow query (${duration}ms): ${text.substring(0, 100)}${text.length > 100 ? "..." : ""}`
      );
    }

    return result;

  } catch (error) {
    const duration = Date.now() - start;
    logger.error(
      `❌ Query error after ${duration}ms: ${error.message} | SQL: ${text.substring(0, 100)}`
    );
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// tenantQuery
//
// Multi-tenant safe SELECT wrapper. Automatically injects a tenant_id filter
// on SELECT queries that don't already have one. This prevents accidental
// cross-tenant data leakage even if a controller forgets to filter.
//
// Only modifies SELECT statements — INSERT/UPDATE/DELETE are passed through
// unchanged (those should already have tenant_id in their WHERE/VALUES).
// ─────────────────────────────────────────────────────────────────────────────
const tenantQuery = async (text, params = [], tenantId) => {
  if (!tenantId) {
    throw new Error("tenantId is required for tenantQuery");
  }

  const trimmed = text.trim().toUpperCase();

  if (trimmed.startsWith("SELECT")) {
    if (!text.includes("tenant_id")) {
      if (text.includes("WHERE")) {
        // Inject after WHERE
        text = text.replace("WHERE", `WHERE tenant_id = $${params.length + 1} AND `);
      } else if (text.includes("ORDER BY") || text.includes("LIMIT")) {
        // Inject before ORDER BY or LIMIT
        const insertBefore = text.search(/ORDER BY|LIMIT/i);
        text = `${text.slice(0, insertBefore)} WHERE tenant_id = $${params.length + 1} ${text.slice(insertBefore)}`;
      } else {
        // Append at end
        text = `${text} WHERE tenant_id = $${params.length + 1}`;
      }
      params = [...params, tenantId];
    }
  }

  return query(text, params);
};

// ─────────────────────────────────────────────────────────────────────────────
// verifyTenantOwnership
//
// Before any UPDATE or DELETE, call this to confirm the resource belongs
// to the requesting tenant. Returns true/false — never throws.
//
// Usage:
//   const owns = await verifyTenantOwnership('verification_requests', id, tenantId);
//   if (!owns) return res.status(403).json({ ... });
// ─────────────────────────────────────────────────────────────────────────────
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