const retryService = require('../services/retryService');
const logger = require('../utils/logger');

/**
 * Background job to process retry queue
 * Run this every minute via cron or scheduler
 */
class RetryJob {
  async execute() {
    const startTime = Date.now();
    
    try {
      logger.info('🔄 Retry job started');
      
      const results = await retryService.processRetryQueue(100);
      
      const duration = Date.now() - startTime;
      logger.info(`✅ Retry job completed in ${duration}ms: ${results.processed} processed`);
      
      return results;
      
    } catch (error) {
      logger.error('❌ Retry job failed:', error);
      throw error;
    }
  }

  /**
   * Schedule job to run periodically
   */
  start(intervalMinutes = 1) {
    const intervalMs = intervalMinutes * 60 * 1000;
    
    logger.info(`⏰ Retry job scheduled every ${intervalMinutes} minute(s)`);
    
    // Run immediately on start
    this.execute().catch(err => logger.error('Initial retry job failed:', err));
    
    // Schedule periodic runs
    setInterval(() => {
      this.execute().catch(err => logger.error('Scheduled retry job failed:', err));
    }, intervalMs);
  }
}

module.exports = new RetryJob();
