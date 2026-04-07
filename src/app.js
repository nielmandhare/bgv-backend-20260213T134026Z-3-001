const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const apiKeyAuth = require('./middlewares/apiKeyAuth');
require('dotenv').config({ path: `.env.${process.env.NODE_ENV || 'development'}` });

// Import routes
const routes = require('./routes');

// Import middleware
const errorMiddleware = require('./middlewares/errorMiddleware');
const requestLogger = require('./middlewares/requestLogger');

// Import utils
const logger = require('./utils/logger');

const app = express();

// ====================================
// HTTPS / PROXY CONFIG (Production Ready)
// ====================================
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// ====================================
// 1. SECURITY MIDDLEWARE
// ====================================
app.use(helmet());
app.use(cors());
app.use(compression());

// ====================================
// 2. PARSING MIDDLEWARE
// ====================================
// CHANGED: Added verify callback to capture raw body buffer.
// webhookMiddleware needs req.rawBody to validate HMAC signatures from IDfy.
// This is the ONLY change from the original app.js.
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ====================================
// 3. LOGGING MIDDLEWARE
// ====================================
app.use(requestLogger);
app.use(logger.middleware);

// ====================================
// 4. RATE LIMITERS
// ====================================

// Global limiter — loose, just protects public routes like /health
const globalLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 min
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' }
});

// API limiter — strict, applied to all /api/* routes
const apiLimiter = rateLimit({
  windowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS) || 60000, // 1 min
  max: Number(process.env.API_RATE_LIMIT_MAX_REQUESTS) || 60,      // 60 req/min
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' }
});

app.use(globalLimiter);                  // applies to everything
app.use('/api', apiLimiter);             // stricter limit on /api/*

// Webhook routes are PUBLIC — IDfy/Gridlines don't send our API key.
// Auth is handled by HMAC signature validation inside webhookMiddleware.
// These must be mounted BEFORE apiKeyAuth.
const webhookRoutes = require('./routes/webhookRoutes');
app.use('/api/webhooks', webhookRoutes);

app.use('/api', apiKeyAuth);             // API key check on /api/*

// ====================================
// 5. HEALTH CHECK (public — no API key)
// ====================================
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    service: 'bgv-api',
    version: '1.0.0'
  });
});

// ====================================
// 6. ROOT ROUTE (public — no API key)
// ====================================
app.get('/', (req, res) => {
  res.json({
    message: 'Background Verification API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    status: 'running',
    documentation: '/api',
    timestamp: new Date().toISOString()
  });
});

// ====================================
// 7. API ROUTES
// ====================================
app.use('/api', routes);

// ====================================
// 8. 404 HANDLER
// ====================================
app.use(errorMiddleware.notFound);

// ====================================
// 9. GLOBAL ERROR HANDLER
// ====================================
app.use(errorMiddleware.errorHandler);

// ====================================
// 10. UNCAUGHT EXCEPTION HANDLER
// ====================================
process.on('uncaughtException', (err) => {
  logger.error('💥 Uncaught Exception:', err);
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (err) => {
  logger.error('💥 Unhandled Rejection:', err);
  setTimeout(() => process.exit(1), 1000);
});

module.exports = app;