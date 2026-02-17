const express = require('express');
const router = express.Router();

const tenantRoutes = require('./tenantRoutes');

router.use('/tenants', tenantRoutes);
router.use('/auth', require('./authRoutes'));


router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

module.exports = router;
