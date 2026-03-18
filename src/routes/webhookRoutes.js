const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Public webhook endpoints (no auth - vendors call these)
router.post('/idfy', webhookController.handleIDfyWebhook);
router.post('/gridlines', webhookController.handleGridlinesWebhook);

// Protected endpoint to get results
router.get('/result/:requestId', webhookController.getResult);

module.exports = router;
