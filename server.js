const app = require('./src/app');
const logger = require('./src/utils/logger');
const pollingScheduler = require('./src/utils/pollingScheduler');
const verificationRetryJob = require('./src/jobs/verificationRetryJob');

const PORT = process.env.PORT || 5001;

// Initialize polling fallback and retry jobs (only in non-test environment)
if (process.env.NODE_ENV !== 'test') {
    pollingScheduler.initialize();
    verificationRetryJob.start();
    logger.info('🔄 Polling fallback and retry jobs initialized');
}

app.listen(PORT, () => {
    logger.info(`🚀 Server running on http://localhost:${PORT}`);
    logger.info(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`📝 API: http://localhost:${PORT}/api`);
    logger.info(`💾 Database: ${process.env.DB_NAME}`);
    logger.info(`🔄 Polling fallback: Active`);
    logger.info(`🔄 Retry job: Active`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    pollingScheduler.shutdown();
    verificationRetryJob.stop();
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    pollingScheduler.shutdown();
    verificationRetryJob.stop();
    process.exit(0);
});
