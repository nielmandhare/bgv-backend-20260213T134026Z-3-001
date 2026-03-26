const Joi = require("joi");

/*
PAN Validation
Format: ABCDE1234F
*/
const panSchema = Joi.object({
  pan_number: Joi.string()
    .pattern(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
    .required(),

  full_name: Joi.string().required(),

  dob: Joi.date().required(),

  client_id: Joi.string().uuid().required()
});


/*
Masked Aadhaar
Format: XXXX-XXXX-1234
*/
const aadhaarSchema = Joi.object({
  masked_aadhaar: Joi.string()
    .pattern(/^XXXX-XXXX-[0-9]{4}$/)
    .required(),

  full_name: Joi.string().required(),

  client_id: Joi.string().uuid().required()
});


/*
GSTIN Validation
*/
const gstinSchema = Joi.object({
  gstin: Joi.string()
    .pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{3}$/)
    .required(),

  business_name: Joi.string().required(),

  client_id: Joi.string().uuid().required()
});


module.exports = {
  panSchema,
  aadhaarSchema,
  gstinSchema
};