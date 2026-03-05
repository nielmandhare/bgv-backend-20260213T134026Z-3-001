const express = require('express');
const router = express.Router();
const verificationController = require('../controllers/verificationController');
const authMiddleware = require('../middlewares/authMiddleware');
const consentMiddleware = require('../middlewares/consentMiddleware');

// All routes require authentication
router.use(authMiddleware.authenticate);

// Create verification with consent validation
router.post(
  '/', 
  consentMiddleware.captureConsent,
  verificationController.createVerification
);

// Alternative: Using validateConsent middleware (more thorough)
router.post(
  '/with-consent-check',
  consentMiddleware.validateConsent(['terms', 'privacy', 'data_processing']),
  consentMiddleware.saveConsent('verification', 'User consented to verification process', '1.0'),
  verificationController.createVerification
);

// Get all verifications for tenant
router.get('/', verificationController.getVerifications);

// Get verification by ID
router.get('/:id', verificationController.getVerificationById);

// Get consent for specific verification
router.get('/:id/consent', verificationController.getVerificationConsent);

// Check consent status for a verification type
router.get('/consent-status/:verification_type', verificationController.checkConsentStatus);

module.exports = router;
