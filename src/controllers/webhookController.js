// src/controllers/webhookController.js
console.log("✅ WEBHOOK CONTROLLER LOADED");

"use strict";

const db                = require("../utils/db");
const responseProcessor = require("../services/responseProcessor");
const logger            = require("../utils/logger");

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPER
// Look up a verification_request that is still pending/processing.
//
// NOTE: This is a placeholder until you add a vendor_request_id column.
// Right now we just grab the most recent pending row. This works for
// single-user dev testing. Production fix: store IDfy's request_id at
// call time, then do WHERE vendor_request_id = $1.
// ─────────────────────────────────────────────────────────────────────────────
async function findVerificationByVendorRequestId(vendorRequestId) {
  console.log(`[findVerification] Looking up vendor request_id: ${vendorRequestId}`);
  const result = await db.query(
    `SELECT * FROM verification_requests
     WHERE api_status IN ('pending', 'processing')
     ORDER BY created_at DESC
     LIMIT 1`
  );
  console.log(`[findVerification] Found rows: ${result.rows.length}`);
  return result.rows[0] || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPER
// Map our DB document_type → responseProcessor verificationType key
// DB stores: 'PAN', 'AADHAAR', 'GSTIN'
// responseProcessor expects: 'pan', 'aadhaar', 'gst'
// ─────────────────────────────────────────────────────────────────────────────
function resolveVerificationType(documentType) {
  const map = {
    PAN:     "pan",
    AADHAAR: "aadhaar",
    GSTIN:   "gst",
  };
  return map[documentType?.toUpperCase()] || "pan";
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPER
// Write an audit row to webhook_events.
// Always fails silently — logging must never break webhook processing.
// ─────────────────────────────────────────────────────────────────────────────
async function logWebhookEvent({ vendor, eventType, payload, verificationId, status, errorMessage }) {
  try {
    await db.query(
      `INSERT INTO webhook_events
         (vendor, event_type, payload, verification_id, status, error_message, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        vendor,
        eventType,
        JSON.stringify(payload),
        verificationId || null,
        status,
        errorMessage || null,
      ]
    );
  } catch (err) {
    logger.warn(`[Webhook] Failed to write webhook_events log: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE HANDLER — shared by IDfy and Gridlines
//
// Why we always return 200:
//   IDfy retries on non-200. If our DB has a hiccup we ACK anyway and log
//   the error internally. IDfy's job is to deliver the payload — our job
//   is to process it. Keep those two concerns separate.
// ─────────────────────────────────────────────────────────────────────────────
async function processWebhook(vendor, payload, res) {
  const vendorRequestId = payload.request_id || payload.id || payload.transaction_id;

  console.log(`[Webhook][${vendor}] Processing — request_id: ${vendorRequestId}`);
  logger.info(`[Webhook][${vendor}] Received — request_id: ${vendorRequestId}`);

  // ── Step 1: Log raw inbound event immediately ──────────────────────────────
  await logWebhookEvent({
    vendor,
    eventType:      payload.status || "unknown",
    payload,
    verificationId: null,
    status:         "received",
  });

  // ── Step 2: Find the matching verification_request ─────────────────────────
  let verification;
  try {
    verification = await findVerificationByVendorRequestId(vendorRequestId);
  } catch (err) {
    logger.error(`[Webhook][${vendor}] DB lookup failed: ${err.message}`);
    console.log(`[Webhook][${vendor}] DB lookup error: ${err.message}`);
    return res.status(200).json({
      success: false,
      message: "Webhook received but DB lookup failed — check logs",
    });
  }

  if (!verification) {
    logger.warn(`[Webhook][${vendor}] No matching verification for request_id: ${vendorRequestId}`);
    console.log(`[Webhook][${vendor}] No match found for request_id: ${vendorRequestId}`);
    await logWebhookEvent({
      vendor,
      eventType:    "unmatched",
      payload,
      verificationId: null,
      status:       "unmatched",
      errorMessage: `No verification found for vendor request_id: ${vendorRequestId}`,
    });
    return res.status(200).json({
      success: false,
      message: "Webhook received but no matching verification found",
    });
  }

  const verificationType = resolveVerificationType(verification.document_type);
  console.log(`[Webhook][${vendor}] Matched verification ${verification.id} (${verification.document_type} → ${verificationType})`);
  logger.info(`[Webhook][${vendor}] Matched verification ${verification.id} (${verification.document_type})`);

  // ── Step 3: Prevent duplicate processing ───────────────────────────────────
  if (verification.api_status === "success") {
    logger.warn(`[Webhook][${vendor}] Duplicate webhook — verification ${verification.id} already processed`);
    console.log(`[Webhook][${vendor}] Duplicate — already processed`);
    await logWebhookEvent({
      vendor,
      eventType:      "duplicate",
      payload,
      verificationId: verification.id,
      status:         "duplicate",
    });
    return res.status(200).json({
      success: true,
      message: "Webhook already processed — duplicate ignored",
    });
  }

  // ── Step 4: Process the payload through responseProcessor ──────────────────
  let processed;
  try {
    processed = responseProcessor.process(vendor, payload, verificationType);
    console.log(`[Webhook][${vendor}] responseProcessor result:`, JSON.stringify(processed));
  } catch (err) {
    logger.error(`[Webhook][${vendor}] responseProcessor threw: ${err.message}`);
    console.log(`[Webhook][${vendor}] responseProcessor error: ${err.message}`);
    processed = {
      status:   "failed",
      verified: false,
      result:   {},
      error:    err.message,
    };
  }

  logger.info(`[Webhook][${vendor}] Processed — status=${processed.status}, verified=${processed.verified}`);

  // ── Step 5: Write to DB — raw db.query matching verificationController pattern
  try {
    const existingResult = await db.query(
      `SELECT id FROM verification_results WHERE verification_id = $1`,
      [verification.id]
    );

    if (existingResult.rows.length === 0) {
      await db.query(
        `INSERT INTO verification_results
           (verification_id, result_data, verified, processed_at)
         VALUES ($1, $2, $3, NOW())`,
        [
          verification.id,
          JSON.stringify(processed),
          processed.verified,
        ]
      );
      console.log(`[Webhook][${vendor}] Inserted verification_results row`);
      logger.info(`[Webhook][${vendor}] Inserted verification_results for ${verification.id}`);
    } else {
      await db.query(
        `UPDATE verification_results
         SET result_data  = $1,
             verified     = $2,
             processed_at = NOW()
         WHERE verification_id = $3`,
        [
          JSON.stringify(processed),
          processed.verified,
          verification.id,
        ]
      );
      console.log(`[Webhook][${vendor}] Updated existing verification_results row`);
      logger.info(`[Webhook][${vendor}] Updated existing verification_results for ${verification.id}`);
    }

    // Update verification_requests — same fields verificationController updates
    await db.query(
      `UPDATE verification_requests
       SET api_status = $1,
           status     = $2
       WHERE id = $3`,
      [
        processed.status,
        processed.verified ? "verified" : "failed",
        verification.id,
      ]
    );

    console.log(`[Webhook][${vendor}] Updated verification_requests — api_status=${processed.status}`);
    logger.info(`[Webhook][${vendor}] Updated verification_requests for ${verification.id}`);

  } catch (err) {
    logger.error(`[Webhook][${vendor}] DB write failed for ${verification.id}: ${err.message}`);
    console.log(`[Webhook][${vendor}] DB write error: ${err.message}`);
    await logWebhookEvent({
      vendor,
      eventType:      payload.status || "unknown",
      payload,
      verificationId: verification.id,
      status:         "db_error",
      errorMessage:   err.message,
    });
    return res.status(200).json({
      success: false,
      message: "Webhook received but result storage failed — check logs",
    });
  }

  // ── Step 6: Final audit log — success ─────────────────────────────────────
  await logWebhookEvent({
    vendor,
    eventType:      payload.status || "completed",
    payload,
    verificationId: verification.id,
    status:         "processed",
  });

  console.log(`[Webhook][${vendor}] ✅ Done — verification_id: ${verification.id}`);

  return res.status(200).json({
    success: true,
    message: "Webhook processed successfully",
    data: {
      verification_id: verification.id,
      api_status:      processed.status,
      verified:        processed.verified,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

exports.handleIDfyWebhook = async (req, res) => {
  console.log("[handleIDfyWebhook] called");
  await processWebhook("idfy", req.body, res);
};

exports.handleGridlinesWebhook = async (req, res) => {
  console.log("[handleGridlinesWebhook] called");
  await processWebhook("gridlines", req.body, res);
};