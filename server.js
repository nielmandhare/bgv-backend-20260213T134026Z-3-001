console.log("SERVER RUNNING FROM:", process.cwd());

// ─── STEP 1: Load env FIRST, before anything else ───────────────────────────
require('dotenv').config({ override: true });

// ─── STEP 2: Env diagnostics (remove after confirming fix) ──────────────────
console.log("🔍 ENV CHECK (before app load):", {
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD ? "✅ set" : "❌ empty",
  DB_NAME: process.env.DB_NAME,
  NODE_ENV: process.env.NODE_ENV,
});

// ─── STEP 3: Required env assertion — fail fast ──────────────────────────────
const REQUIRED_ENV = [
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'ACCESS_TOKEN_SECRET',
];

const missingVars = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingVars.length > 0) {
  console.error("❌ Missing required environment variables:", missingVars);
  process.exit(1);
}

// ─── STEP 4: App + logger (loaded AFTER env is confirmed ready) ──────────────
const app = require('./src/app');
const logger = require('./src/utils/logger');

const PORT = process.env.PORT || 5001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ─── STEP 5: Start server ────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`🚀 Server running on http://localhost:${PORT}`);
  logger.info(`📦 Environment: ${NODE_ENV}`);
  logger.info(`📝 API Docs:    http://localhost:${PORT}/api`);
  logger.info(`💾 Database:    ${process.env.DB_NAME}`);
  logger.info(`👤 DB User:     ${process.env.DB_USER}`);
});