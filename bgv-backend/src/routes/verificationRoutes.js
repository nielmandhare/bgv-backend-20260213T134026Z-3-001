console.log("✅ VERIFICATION ROUTES LOADED");

const express = require("express");
const router = express.Router();

const {
  createPanVerification,
  createAadhaarVerification,
  createGstinVerification
} = require("../controllers/verificationController");

const validate = require("../middlewares/validate");

const {
  panSchema,
  aadhaarSchema,
  gstinSchema
} = require("../validator/verificationValidator");


/*
PAN Verification
*/
router.post(
  "/pan",
  validate(panSchema),
  createPanVerification
);


/*
Aadhaar Verification
*/
router.post(
  "/aadhaar",
  validate(aadhaarSchema),
  createAadhaarVerification
);


/*
GSTIN Verification
*/
router.post(
  "/gstin",
  validate(gstinSchema),
  createGstinVerification
);

module.exports = router;