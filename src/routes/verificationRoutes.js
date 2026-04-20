console.log("✅ VERIFICATION ROUTES LOADED");

const express = require("express");
const router  = express.Router();

const verificationController                  = require("../controllers/verificationController");
const { panSchema, aadhaarSchema, gstinSchema } = require("../validator/verificationValidator");

console.log("DEBUG Controller:", verificationController);

// ─────────────────────────────────────────────────────────────────────────────
// validate — inline Joi middleware factory
//
// Why inline and not imported from middlewares/validate.js?
// The existing middlewares/validate.js may wrap errors differently. Defining
// it here keeps validation self-contained in the routes file and guarantees
// the 400 shape the test suite expects, regardless of what validate.js does.
//
// abortEarly: false  → collect ALL field errors in one response, not just first
// allowUnknown: false → reject any field not declared in the schema (security)
// ─────────────────────────────────────────────────────────────────────────────
function validate(schema) {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, {
      abortEarly:   false,
      allowUnknown: false,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors:  error.details.map((d) => d.message),
      });
    }

    next();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
//
// validate() runs BEFORE the controller on every POST.
// Invalid requests are rejected with 400 here — the controller never runs.
// ─────────────────────────────────────────────────────────────────────────────

/* PAN Verification */
router.post("/pan",       validate(panSchema),     verificationController.createPanVerification);

/* Aadhaar Verification */
router.post("/aadhaar",   validate(aadhaarSchema), verificationController.createAadhaarVerification);

/* GSTIN Verification */
router.post("/gstin",     validate(gstinSchema),   verificationController.createGstinVerification);

/* Retry Verification */
router.post("/retry/:id", verificationController.retryVerification);

/* Get Verification Result by ID */
router.get("/:id",        verificationController.getVerificationById);

router.get("/", (req, res) => {
  res.json({ message: "Verification routes working" });
});

module.exports = router;