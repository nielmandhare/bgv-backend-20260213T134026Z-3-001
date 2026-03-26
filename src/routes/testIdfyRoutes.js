const express = require('express');
const router = express.Router();
const testIdfyController = require('../controllers/testIdfyController');

// Test routes (development only)
router.post('/pan', testIdfyController.testPAN);
router.post('/aadhaar', testIdfyController.testAadhaar);
router.get('/connection', testIdfyController.testConnection);

module.exports = router;
