const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const apiKeyAuth = require('./middlewares/apiKeyAuth');

require('dotenv').config();


// Import routes
const routes = require('./routes/index');

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
app.use(helmet());                     // Security headers
app.use(cors());                      // CORS support
app.use(compression());              // Gzip compression

// ====================================
// 2. PARSING MIDDLEWARE
// ====================================
app.use(express.json({ limit: '10mb' }));     // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ====================================
// 3. LOGGING MIDDLEWARE (NO SENSITIVE DATA)
// ====================================
app.use(requestLogger);              // Log requests with masked sensitive data
app.use(logger.middleware);         // Log response times and status codes
/* ========================
   Rate Limiter Middleware
======================== */
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: "Too many requests, please try again later."
});

app.use(limiter);   // 👈 PUT HERE
app.use('/api', apiKeyAuth);


// ====================================
// 4. HEALTH CHECK (NO LOGGING)
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
// 5. ROOT ROUTE
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
// 6. API ROUTES
// ====================================
app.use('/api', routes);

// ====================================
// 7. 404 HANDLER - Route not found
// ====================================
app.use(errorMiddleware.notFound);

// ====================================
// 8. GLOBAL ERROR HANDLER
// ====================================
app.use(errorMiddleware.errorHandler);

// ====================================
// 9. UNCAUGHT EXCEPTION HANDLER
// ====================================
process.on('uncaughtException', (err) => {
  logger.error('💥 Uncaught Exception:', err);
  // Gracefully shutdown
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on('unhandledRejection', (err) => {
  logger.error('💥 Unhandled Rejection:', err);
  // Gracefully shutdown
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

module.exports = app;