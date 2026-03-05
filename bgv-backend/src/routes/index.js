console.log("✅ ROUTES INDEX LOADED");
console.log("ROUTES FILE PATH:", __dirname);


const express = require('express');
const router = express.Router();

const tenantRoutes = require('./tenantRoutes');
const uploadRoutes = require('./uploadRoutes');  
const authRoutes = require('./authRoutes');
const verificationRoutes = require("./verificationRoutes");

router.use('/tenants', tenantRoutes);
router.use('/auth', authRoutes);
router.use('/upload', uploadRoutes);   
router.use("/verification", verificationRoutes);          

router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

module.exports = router;
