const retryJob = require('./retryJob');
const logger = require('../utils/logger');

class Scheduler {
  start() {
    logger.info('🚀 Starting job scheduler...');
    
    // Start retry job (runs every minute)
    retryJob.start(1);
    
    // Add more jobs here as needed
    // - cleanupJob.start(24)  // Run daily
    // - reportJob.start(60)   // Run hourly
    
    logger.info('✅ Scheduler started');
  }
}

module.exports = new Scheduler();
