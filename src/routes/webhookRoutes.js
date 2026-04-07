// src/routes/webhookRoutes.js
//
// All webhook routes are PUBLIC — no JWT required.
// IDfy and Gridlines call these from their servers; they don't have your JWT.
//
// Auth is replaced by HMAC signature validation in webhookMiddleware.
//
// The getResult route that was here previously has been REMOVED.
// It belongs in verificationRoutes.js (which already has auth applied).
// Use GET /api/verifications/:id — that endpoint returns the same data.

"use strict";

const express          = require("express");
const router           = express.Router();
const webhookController = require("../controllers/webhookController");
const webhookMiddleware = require("../middlewares/webhookMiddleware");

// Log every inbound webhook hit — applied to all routes in this file
router.use(webhookMiddleware.logInboundWebhook);

// POST /api/webhooks/idfy
// IDfy calls this when a verification task completes asynchronously.
// middlewares applied: logInboundWebhook (above) → validateIDfySignature → handler
router.post(
  "/idfy",
  webhookMiddleware.validateIDfySignature,
  webhookController.handleIDfyWebhook
);

// POST /api/webhooks/gridlines
// Gridlines stub — ready for when the account is activated.
router.post(
  "/gridlines",
  webhookMiddleware.validateGridlinesSignature,
  webhookController.handleGridlinesWebhook
);

module.exports = router;