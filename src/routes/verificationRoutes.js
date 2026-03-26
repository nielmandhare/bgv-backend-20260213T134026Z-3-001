console.log("✅ VERIFICATION ROUTES LOADED");

const express = require("express");
const router = express.Router();

const verificationController = require("../controllers/verificationController");

console.log("DEBUG Controller:", verificationController);

/* PAN Verification */
router.post("/pan", verificationController.createPanVerification);

/* Aadhaar Verification */
router.post("/aadhaar", verificationController.createAadhaarVerification);

/* GSTIN Verification */
router.post("/gstin", verificationController.createGstinVerification);

/* Retry Verification */
router.post("/retry/:id", verificationController.retryVerification);

router.get('/', (req, res) => {
  res.json({ message: 'Verification routes working' });
});

module.exports = router;