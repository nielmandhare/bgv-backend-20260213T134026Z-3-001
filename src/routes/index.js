const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const tenantMiddleware = require('../middlewares/tenantMiddleware');


const authRoutes = require('./authRoutes');
const tenantRoutes = require('./tenantRoutes');
const bulkUploadRoutes = require('./bulkUploadRoutes');
const documentRoutes = require('./documentRoutes');
const consentRoutes = require('./consentRoutes');
const verificationRoutes = require('./verificationRoutes');
const webhookRoutes = require('./webhookRoutes');
const uploadRoutes = require('./uploadRoutes');
const reportRoutes = require('./reportRoutes');

router.use('/auth', authRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/reports', reportRoutes);

router.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

router.use(authMiddleware);
router.use(tenantMiddleware.extractTenant);
router.use(tenantMiddleware.logAccessAttempt);

router.use('/tenants', tenantRoutes);
router.use('/bulk-upload', bulkUploadRoutes);
router.use('/documents', documentRoutes);
router.use('/consent', consentRoutes);
router.use('/upload', uploadRoutes);
router.use('/verifications', verificationRoutes);
router.use('/verification', verificationRoutes);

module.exports = router;
