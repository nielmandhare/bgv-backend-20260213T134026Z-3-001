const express = require('express');
const router = express.Router();
const consentController = require('../controllers/consentController');
const authMiddleware = require('../middlewares/authMiddleware');
const consentMiddleware = require('../middlewares/consentMiddleware');

// All routes require authentication
router.use(authMiddleware.authenticate);

// Get all consents for current user
router.get('/my-consents', consentController.getMyConsents);

// Get specific consent type
router.get('/type/:type', consentController.getConsentByType);

// Get required consents for verification type
router.get('/required/:verificationType', consentController.getRequiredConsents);

// Accept a single consent
router.post('/accept', consentController.acceptConsent);

// Accept multiple consents at once
router.post('/bulk-accept', consentController.bulkAcceptConsents);

// Withdraw consent
router.post('/:consentId/withdraw', consentController.withdrawConsent);

// Get consent statistics (admin only)
router.get('/stats', consentController.getConsentStats);

module.exports = router;
