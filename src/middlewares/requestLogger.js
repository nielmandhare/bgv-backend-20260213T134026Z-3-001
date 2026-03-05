const logger = require('../utils/logger');

/**
 * Request logging middleware
 * Logs all API requests with sensitive data masked
 */
const requestLogger = (req, res, next) => {
  // Don't log sensitive paths
  if (req.originalUrl.includes('/webhook') || req.originalUrl.includes('/health')) {
    return next();
  }

  // Mask sensitive data in request body
  let logBody = { ...req.body };
  
  // Mask passwords, tokens, PAN, Aadhaar
  const sensitiveFields = ['password', 'password_hash', 'token', 'pan', 'aadhaar', 'pan_number', 'aadhaar_number', 'api_key', 'secret'];
  
  sensitiveFields.forEach(field => {
    if (logBody[field]) {
      logBody[field] = '***MASKED***';
    }
  });

  // Log request
  logger.debug(`📥 ${req.method} ${req.originalUrl}`, {
    query: req.query,
    body: logBody,
    ip: req.ip,
    user: req.user?.id || 'unauthenticated'
  });

  next();
};

module.exports = requestLogger;
