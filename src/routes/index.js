const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const tenantMiddleware = require('../middlewares/tenantMiddleware');

const tenantRoutes = require('./tenantRoutes');
const bulkUploadRoutes = require('./bulkUploadRoutes');
const documentRoutes = require('./documentRoutes');
const consentRoutes = require('./consentRoutes');
const verificationRoutes = require('./verificationRoutes');

router.use(authMiddleware.authenticate);
router.use(tenantMiddleware.extractTenant);
router.use(tenantMiddleware.logAccessAttempt);

router.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString()
  });
});

router.use('/tenants', tenantRoutes);
router.use('/bulk-upload', bulkUploadRoutes);
router.use('/documents', documentRoutes);
router.use('/consent', consentRoutes);
router.use('/verifications', verificationRoutes);

module.exports = router;

// Webhook routes (public - no auth for webhooks)
const webhookRoutes = require('./webhookRoutes');
router.use('/webhooks', webhookRoutes);

// Retry routes
const retryRoutes = require('./retryRoutes');
router.use('/retry', retryRoutes);

// Test routes (IDFY testing)
const testIdfyRoutes = require('./testIdfyRoutes');
router.use('/test-idfy', testIdfyRoutes);
