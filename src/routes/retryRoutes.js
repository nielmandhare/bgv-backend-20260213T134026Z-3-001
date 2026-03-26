const express = require('express');
const router = express.Router();
const retryController = require('../controllers/retryController');
const authMiddleware = require('../middlewares/authMiddleware');
const tenantMiddleware = require('../middlewares/tenantMiddleware');

// All routes require authentication and tenant isolation
router.use(authMiddleware.authenticate);
router.use(tenantMiddleware.extractTenant);

// Get retry statistics
router.get('/stats', retryController.getRetryStats);

// Get retry history for a specific request
router.get('/history/:requestId', retryController.getRetryHistory);

// Manually retry a failed request
router.post('/:requestId/retry', retryController.manualRetry);

// Cancel scheduled retry
router.delete('/:requestId', retryController.cancelRetry);

// Admin only: trigger retry queue processing
router.post('/trigger-queue', retryController.triggerRetryQueue);

module.exports = router;
