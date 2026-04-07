// src/middlewares/webhookMiddleware.js
//
// Two jobs:
//   1. validateWebhookSignature — verify the request actually came from IDfy,
//      not a random actor who found your webhook URL.
//   2. logInboundWebhook        — structured log line for every webhook hit.
//
// ─── How IDfy signature validation works ────────────────────────────────────
// IDfy sends a header: x-idfy-signature (HMAC-SHA256 of the raw request body,
// signed with your webhook secret).
// We recompute the HMAC and compare using timingSafeEqual to prevent
// timing attacks.
//
// To enable: set IDFY_WEBHOOK_SECRET in .env.development
// To disable/defer: leave it unset — middleware will warn but not block.
//
// ─── How Gridlines signature validation works ────────────────────────────────
// Gridlines sends: x-gridlines-signature  (same HMAC-SHA256 pattern)
// Set GRIDLINES_WEBHOOK_SECRET in .env to enable.

"use strict";

const crypto = require("crypto");
const logger = require("../utils/logger");

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT: Express's express.json() middleware parses the body and discards
// the raw buffer. HMAC validation requires the RAW body bytes.
//
// To make this work, you need to capture the raw body BEFORE json parsing.
// In src/app.js, replace:
//   app.use(express.json())
// With:
//   app.use(express.json({
//     verify: (req, res, buf) => { req.rawBody = buf; }
//   }))
//
// This is a one-line change in app.js — see the note at the bottom of this file.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes HMAC-SHA256 of the raw request body and compares it to
 * the vendor-supplied signature header using constant-time comparison.
 *
 * @param {Buffer} rawBody    - req.rawBody (set by express.json verify option)
 * @param {string} signature  - Value from the vendor's signature header
 * @param {string} secret     - Webhook secret from .env
 * @returns {boolean}
 */
function isValidSignature(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  // Constant-time comparison — prevents timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    // timingSafeEqual throws if buffers are different lengths
    return false;
  }
}

/**
 * validateIDfySignature
 *
 * Express middleware. Reads x-idfy-signature header and validates it.
 * If IDFY_WEBHOOK_SECRET is not set, logs a warning and passes through
 * (allows you to test without the secret, then lock it down later).
 */
exports.validateIDfySignature = (req, res, next) => {
  const secret = process.env.IDFY_WEBHOOK_SECRET;

  if (!secret) {
    logger.warn(
      "[Webhook][IDfy] IDFY_WEBHOOK_SECRET not set — skipping signature validation. " +
      "Set this in .env.development before going to production."
    );
    return next();
  }

  const signature = req.headers["x-idfy-signature"];

  if (!signature) {
    logger.warn("[Webhook][IDfy] Missing x-idfy-signature header — rejecting");
    return res.status(401).json({
      success: false,
      message: "Missing webhook signature",
    });
  }

  if (!isValidSignature(req.rawBody, signature, secret)) {
    logger.warn("[Webhook][IDfy] Invalid signature — possible spoofed request");
    return res.status(401).json({
      success: false,
      message: "Invalid webhook signature",
    });
  }

  logger.info("[Webhook][IDfy] Signature validated ✅");
  next();
};

/**
 * validateGridlinesSignature
 *
 * Same pattern as IDfy — for when Gridlines goes live.
 */
exports.validateGridlinesSignature = (req, res, next) => {
  const secret = process.env.GRIDLINES_WEBHOOK_SECRET;

  if (!secret) {
    logger.warn(
      "[Webhook][Gridlines] GRIDLINES_WEBHOOK_SECRET not set — skipping signature validation."
    );
    return next();
  }

  const signature = req.headers["x-gridlines-signature"];

  if (!signature) {
    logger.warn("[Webhook][Gridlines] Missing x-gridlines-signature header — rejecting");
    return res.status(401).json({
      success: false,
      message: "Missing webhook signature",
    });
  }

  if (!isValidSignature(req.rawBody, signature, secret)) {
    logger.warn("[Webhook][Gridlines] Invalid signature — possible spoofed request");
    return res.status(401).json({
      success: false,
      message: "Invalid webhook signature",
    });
  }

  logger.info("[Webhook][Gridlines] Signature validated ✅");
  next();
};

/**
 * logInboundWebhook
 *
 * Logs a structured one-liner for every inbound webhook hit.
 * Goes BEFORE the signature check so you can see even rejected requests.
 */
exports.logInboundWebhook = (req, res, next) => {
  logger.info(
    `[Webhook] Inbound — vendor path: ${req.path} | ` +
    `IP: ${req.ip} | ` +
    `Content-Type: ${req.headers["content-type"] || "none"} | ` +
    `Body size: ${req.headers["content-length"] || "unknown"} bytes`
  );
  next();
};