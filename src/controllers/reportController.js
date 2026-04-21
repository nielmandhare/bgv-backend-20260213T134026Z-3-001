/**
 * reportController.js
 *
 * GET /api/reports/:id
 *
 * 1. Fetches full verification record (JOIN tenants for client_name)
 * 2. Calls pdfReportService → PDF is saved to src/pdfs/
 * 3. Streams the saved file back to the client as a download
 * 4. Does NOT delete the file — src/pdfs/ is the persistent store
 */

"use strict";

const fs                             = require("fs");
const path                           = require("path");
const db                             = require("../utils/db");
const { generateVerificationReport } = require("../services/pdfReportService");
const logger                         = require("../utils/logger");

exports.generateReport = async (req, res, next) => {
  const { id } = req.params;

  // ── 1. Fetch verification + client name ─────────────────────────────────
  let row;
  try {
    const result = await db.query(
      `SELECT
         vr.id,
         vr.document_type,
         vr.document_number,
         vr.full_name,
         vr.dob,
         vr.business_name,
         vr.client_id,
         vr.api_status,
         vr.status,
         vr.failure_reason,
         vr.retry_count,
         vr.created_at,
         vr.last_api_attempt,
         res.verified,
         res.result_data,
         res.processed_at,
         t.name AS client_name
       FROM verification_requests vr
       LEFT JOIN verification_results res ON res.verification_id = vr.id
       LEFT JOIN tenants             t   ON t.id = vr.client_id
       WHERE vr.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Verification not found" });
    }

    row = result.rows[0];
  } catch (dbErr) {
    logger.error(`[reportController] DB error for ${id}: ${dbErr.message}`);
    return next(dbErr);
  }

  // ── 2. Generate PDF → saved to src/pdfs/ ────────────────────────────────
  let filePath;
  try {
    logger.info(
      `[reportController] Generating report — id=${id}, ` +
      `type=${row.document_type}, client=${row.client_name ?? row.client_id}`
    );
    filePath = await generateVerificationReport(row);
  } catch (genErr) {
    logger.error(`[reportController] PDF generation failed for ${id}: ${genErr.message}`);
    return next(genErr);
  }

  // ── 3. Stream saved file to HTTP response ────────────────────────────────
  const filename = path.basename(filePath);

  res.setHeader("Content-Type",        "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control",       "no-store");

  const readStream = fs.createReadStream(filePath);

  readStream.on("error", (streamErr) => {
    logger.error(`[reportController] Stream error for ${id}: ${streamErr.message}`);
    // Headers already sent — destroy rather than call next()
    res.destroy(streamErr);
  });

  readStream.on("end", () => {
    logger.info(`[reportController] ✅ Report streamed — id=${id}, file=${filename}`);
  });

  readStream.pipe(res);
};