const express = require('express');
const router = express.Router();
const { AuditLog } = require('../models');
const authMiddleware = require('../middlewares/authMiddleware');

// All audit routes require admin access
router.use(authMiddleware.authenticate);
router.use(authMiddleware.authorize(['admin', 'auditor']));

// Get audit logs for tenant
router.get('/tenant/:tenantId', async (req, res) => {
  try {
    const logs = await AuditLog.findByTenant(req.params.tenantId);
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get audit logs for specific entity
router.get('/entity/:entityType/:entityId', async (req, res) => {
  try {
    const logs = await AuditLog.findByEntity(req.params.entityType, req.params.entityId);
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get audit logs for user
router.get('/user/:userId', async (req, res) => {
  try {
    const logs = await AuditLog.findByUser(req.params.userId);
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search audit logs
router.post('/search', async (req, res) => {
  try {
    const logs = await AuditLog.search(req.body);
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
