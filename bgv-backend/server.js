require('dotenv').config();

const app = require('./src/app');
const logger = require('./src/utils/logger');

const PORT = process.env.PORT || 5001;
const NODE_ENV = process.env.NODE_ENV || 'development';

if (!process.env.ACCESS_TOKEN_SECRET) {
  logger.error("❌ ACCESS_TOKEN_SECRET is missing in environment variables");
  process.exit(1);
}

app.listen(PORT, () => {
  logger.info(`🚀 Server running on http://localhost:${PORT}`);
  logger.info(`📦 Environment: ${NODE_ENV}`);
  logger.info(`📝 API: http://localhost:${PORT}/api`);
  logger.info(`💾 Database: ${process.env.DB_NAME}`);
});
