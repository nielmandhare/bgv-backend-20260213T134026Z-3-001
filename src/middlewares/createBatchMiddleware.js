const bulkUploadService = require('../services/bulkUploadService');

module.exports = async function createBatchMiddleware(req, res, next) {
  try {
    const { tenant_id, user_id } = req.user;

    const isCsv = req.originalUrl.includes('/csv');
    const fileType = isCsv ? 'csv' : 'files';
    
    const batch = await bulkUploadService.createBatch(
      tenant_id,
      user_id,
      fileType,
      {
        source: req.originalUrl,
        timestamp: new Date().toISOString()
      }
    );

    req.batchId = batch.id;
    req.batch = batch;

    console.log(`📦 Batch created: ${batch.id}`);
    next();
  } catch (error) {
    console.error('❌ Failed to create batch:', error);
    next(error);
  }
};
