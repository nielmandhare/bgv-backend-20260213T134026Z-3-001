const Joi = require("joi");

// ─────────────────────────────────────────────────────────────────────────────
// PAN Validation
//
// Format: ABCDE1234F
//   - 5 uppercase letters
//   - 4 digits
//   - 1 uppercase letter
//
// full_name: .min(1) is required because Joi.string().required() alone still
//            accepts an empty string "". .min(1) forces at least one character.
// ─────────────────────────────────────────────────────────────────────────────
const panSchema = Joi.object({
  pan_number: Joi.string()
    .pattern(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
    .required()
    .messages({
      "string.pattern.base": "pan_number must be in the format ABCDE1234F (5 letters, 4 digits, 1 letter — all uppercase)",
      "any.required":        "pan_number is required",
    }),

  full_name: Joi.string()
    .min(1)
    .required()
    .messages({
      "string.empty": "full_name cannot be empty",
      "string.min":   "full_name cannot be empty",
      "any.required": "full_name is required",
    }),

  dob: Joi.date()
    .required()
    .messages({
      "any.required": "dob is required",
    }),

  client_id: Joi.string()
    .uuid()
    .required()
    .messages({
      "string.guid":  "client_id must be a valid UUID v4",
      "any.required": "client_id is required",
    }),
});


// ─────────────────────────────────────────────────────────────────────────────
// Masked Aadhaar Validation
//
// Format: XXXX-XXXX-1234
//   - Exactly the literal string "XXXX-XXXX-" followed by 4 digits
//   - Full Aadhaar numbers are never accepted (UIDAI compliance)
//   - Pattern: "1234-5678-9012" must be rejected (digits in first two groups)
// ─────────────────────────────────────────────────────────────────────────────
const aadhaarSchema = Joi.object({
  masked_aadhaar: Joi.string()
    .pattern(/^XXXX-XXXX-[0-9]{4}$/)
    .required()
    .messages({
      "string.pattern.base": "masked_aadhaar must be in the format XXXX-XXXX-1234 (only last 4 digits)",
      "any.required":        "masked_aadhaar is required",
    }),

  full_name: Joi.string()
    .min(1)
    .required()
    .messages({
      "string.empty": "full_name cannot be empty",
      "string.min":   "full_name cannot be empty",
      "any.required": "full_name is required",
    }),

  client_id: Joi.string()
    .uuid()
    .required()
    .messages({
      "string.guid":  "client_id must be a valid UUID v4",
      "any.required": "client_id is required",
    }),
});


// ─────────────────────────────────────────────────────────────────────────────
// GSTIN Validation
//
// Format: 27ABCDE1234F1Z5
//   - 2 digits  (state code)
//   - 5 uppercase letters (PAN first 5)
//   - 4 digits  (PAN digits)
//   - 1 uppercase letter (PAN last char)
//   - 3 alphanumeric chars (entity code + check digit)
//
// Total: 15 characters
// ─────────────────────────────────────────────────────────────────────────────
const gstinSchema = Joi.object({
  gstin: Joi.string()
    .pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{3}$/)
    .required()
    .messages({
      "string.pattern.base": "gstin must be a valid 15-character GSTIN (e.g. 27ABCDE1234F1Z5)",
      "any.required":        "gstin is required",
    }),

  business_name: Joi.string()
    .min(1)
    .required()
    .messages({
      "string.empty": "business_name cannot be empty",
      "string.min":   "business_name cannot be empty",
      "any.required": "business_name is required",
    }),

  client_id: Joi.string()
    .uuid()
    .required()
    .messages({
      "string.guid":  "client_id must be a valid UUID v4",
      "any.required": "client_id is required",
    }),
});


module.exports = {
  panSchema,
  aadhaarSchema,
  gstinSchema,
};