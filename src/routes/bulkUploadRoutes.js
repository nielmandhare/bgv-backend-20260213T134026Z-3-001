const express = require('express');
const router = express.Router();
const bulkUploadController = require('../controllers/bulkUploadController');
const { 
  handleMultipleUpload, 
  handleSingleUpload 
} = require('../middlewares/bulkUploadMiddleware');
const createBatchMiddleware = require('../middlewares/createBatchMiddleware');
const authMiddleware = require('../middlewares/authMiddleware');

console.log('DEBUG:',
  typeof createBatchMiddleware,
  typeof handleMultipleUpload,
  typeof bulkUploadController.uploadFiles
);
// All routes require authentication


// ============================================
// IMPORTANT: MIDDLEWARE ORDER MATTERS!
// 1. createBatchMiddleware - Creates batch in DB
// 2. handleUpload - Saves files using batchId
// 3. controller - Processes the request
// ============================================

// Upload multiple files
router.post(
  '/files', 
  createBatchMiddleware,      // 1st: Create batch
  handleMultipleUpload,       // 2nd: Upload files
  bulkUploadController.uploadFiles  // 3rd: Return response
);

// Upload CSV for bulk verification
router.post(
  '/csv', 
  createBatchMiddleware,      // 1st: Create batch
  handleSingleUpload,         // 2nd: Upload file
  bulkUploadController.uploadCsv  // 3rd: Return response
);

// Get batch status
router.get('/batches/:batchId', bulkUploadController.getBatchStatus);

// ========== NEW ROUTES (Added here, before module.exports) ==========

// Get batch results with verification requests
router.get('/batches/:batchId/results', bulkUploadController.getBatchResults);

// Download error report
router.get('/batches/:batchId/errors', bulkUploadController.downloadErrorReport);

// Get all batches for tenant
router.get('/batches', bulkUploadController.getBatches);

// Get batch documents
router.get('/batches/:batchId/documents', bulkUploadController.getBatchDocuments);

// Get batch statistics
router.get('/stats', bulkUploadController.getBatchStats);

// Retry failed batch
router.post('/batches/:batchId/retry', bulkUploadController.retryBatch);

// Retry only failed rows (new)
router.post('/batches/:batchId/retry-rows', bulkUploadController.retryFailedRows);

// Cancel/delete batch (new)
router.delete('/batches/:batchId', bulkUploadController.cancelBatch);

module.exports = router;