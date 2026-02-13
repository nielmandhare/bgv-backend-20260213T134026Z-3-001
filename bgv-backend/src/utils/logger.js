const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Log levels
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const currentLevel = process.env.NODE_ENV === 'production' 
  ? LOG_LEVELS.INFO 
  : LOG_LEVELS.DEBUG;

// Simple file logging
const writeToFile = (level, message) => {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${level}: ${message}\n`;
  
  // Today's date for filename
  const date = new Date().toISOString().split('T')[0];
  const filename = path.join(logDir, `${date}.log`);
  
  fs.appendFileSync(filename, logLine);
};

const logger = {
  debug: (...args) => {
    if (currentLevel <= LOG_LEVELS.DEBUG) {
      const message = args.join(' ');
      console.debug('🐛 [DEBUG]:', ...args);
      writeToFile('DEBUG', message);
    }
  },

  info: (...args) => {
    if (currentLevel <= LOG_LEVELS.INFO) {
      const message = args.join(' ');
      console.log('📘 [INFO]:', ...args);
      writeToFile('INFO', message);
    }
  },

  warn: (...args) => {
    if (currentLevel <= LOG_LEVELS.WARN) {
      const message = args.join(' ');
      console.warn('⚠️ [WARN]:', ...args);
      writeToFile('WARN', message);
    }
  },

  error: (...args) => {
    if (currentLevel <= LOG_LEVELS.ERROR) {
      const message = args.join(' ');
      console.error('❌ [ERROR]:', ...args);
      writeToFile('ERROR', message);
      
      // Also write to separate error log
      const errorLog = path.join(logDir, 'error.log');
      const timestamp = new Date().toISOString();
      fs.appendFileSync(errorLog, `[${timestamp}] ${message}\n`);
    }
  },

  // Express middleware for request logging
  middleware: (req, res, next) => {
    const start = Date.now();
    
    // Log when request completes
    res.on('finish', () => {
      const duration = Date.now() - start;
      const message = `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`;
      
      if (res.statusCode >= 500) {
        logger.error(message);
      } else if (res.statusCode >= 400) {
        logger.warn(message);
      } else {
        logger.info(message);
      }
    });
    
    next();
  },
};

module.exports = logger;
