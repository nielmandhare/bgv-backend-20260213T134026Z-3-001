/**
 * pdfReportService.js
 *
 * Generates a branded BGV verification report PDF.
 * Saves each report to:  <project-root>/src/pdfs/bgv-report-<type>-<id>.pdf
 * Also returns the saved file path so the controller can stream it to the client.
 *
 * Place this file at:  src/services/pdfReportService.js
 * Logo must be at:     src/assets/2546_SHOVEL SCREENING SOLUTIONS_Logo Design_Dec23_ART.png
 *
 * FIX v2 — proper page-break handling:
 *   The original code pre-calculated the full JSON block height in one shot,
 *   drew a single giant rectangle, then let PDFKit silently paginate the text
 *   across N pages it never told us about.  The result: y tracking went off-page,
 *   the signature ended up on a phantom extra page, and blank pages appeared.
 *
 *   Now drawRawDataSection chunks the JSON line-by-line, renders each chunk with
 *   its own correctly-sized background block, and inserts explicit page breaks.
 *   y always reflects the real cursor position on the real current page.
 */

"use strict";

const PDFDocument = require("pdfkit");
const path        = require("path");
const fs          = require("fs");

// ─── Paths ────────────────────────────────────────────────────────────────────
const SRC_DIR     = path.resolve(__dirname, "..");
const LOGO_PATH   = path.join(SRC_DIR, "assets", "2546_SHOVEL SCREENING SOLUTIONS_Logo Design_Dec23_ART.png");
const PDF_OUT_DIR = path.join(SRC_DIR, "pdfs");

if (!fs.existsSync(PDF_OUT_DIR)) {
  fs.mkdirSync(PDF_OUT_DIR, { recursive: true });
  console.log(`[pdfReportService] Created output directory: ${PDF_OUT_DIR}`);
}

const LOGO_EXISTS = fs.existsSync(LOGO_PATH);
console.log(`[pdfReportService] Logo path : ${LOGO_PATH}`);
console.log(`[pdfReportService] Logo found: ${LOGO_EXISTS}`);
console.log(`[pdfReportService] PDF outdir: ${PDF_OUT_DIR}`);

// ─── Brand ────────────────────────────────────────────────────────────────────
const BRAND = {
  name:         "Shovel Screening Solutions",
  tagline:      "Background Verification Platform",
  primaryColor: "#1A1A2E",
  accentColor:  "#E94560",
  mutedColor:   "#6B7280",
  successColor: "#10B981",
  failedColor:  "#EF4444",
  pendingColor: "#F59E0B",
  borderColor:  "#E5E7EB",
};

const PAGE          = { margin: 50, width: 595, height: 842 };
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

// Content must stay above this y-value on every page (leaves room for the footer).
const USABLE_BOT = PAGE.height - 65;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(val) {
  if (!val) return "—";
  try {
    const d = val instanceof Date ? val : new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toUTCString().replace(" GMT", " UTC");
  } catch { return String(val); }
}

function statusDisplay(value) {
  const map = {
    success:    { label: "SUCCESS",    color: BRAND.successColor },
    verified:   { label: "VERIFIED",   color: BRAND.successColor },
    failed:     { label: "FAILED",     color: BRAND.failedColor  },
    pending:    { label: "PENDING",    color: BRAND.pendingColor },
    processing: { label: "PROCESSING", color: BRAND.pendingColor },
    retrying:   { label: "RETRYING",   color: BRAND.pendingColor },
  };
  return map[value?.toLowerCase()] ?? { label: (value ?? "—").toUpperCase(), color: BRAND.mutedColor };
}

function drawRule(doc, y, color = BRAND.borderColor, thickness = 0.5) {
  doc.save()
     .moveTo(PAGE.margin, y)
     .lineTo(PAGE.width - PAGE.margin, y)
     .lineWidth(thickness)
     .strokeColor(color)
     .stroke()
     .restore();
  return y + thickness + 4;
}

function drawRow(doc, y, label, value, opts = {}) {
  const { valueColor = BRAND.primaryColor, bold = false } = opts;
  const labelWidth = 180;
  const valueX     = PAGE.margin + labelWidth;
  const valueWidth = CONTENT_WIDTH - labelWidth;

  doc.font("Helvetica").fontSize(10).fillColor(BRAND.mutedColor)
     .text(label, PAGE.margin, y, { width: labelWidth, lineBreak: false });

  doc.font(bold ? "Helvetica-Bold" : "Helvetica")
     .fontSize(10)
     .fillColor(valueColor)
     .text(String(value ?? "—"), valueX, y, { width: valueWidth });

  const h = doc.heightOfString(String(value ?? "—"), { width: valueWidth });
  return y + Math.max(h, 14) + 4;
}

function drawSectionHeading(doc, y, title) {
  doc.save()
     .rect(PAGE.margin, y, 3, 18)
     .fill(BRAND.accentColor)
     .restore();
  doc.font("Helvetica-Bold").fontSize(12).fillColor(BRAND.primaryColor)
     .text(title, PAGE.margin + 10, y + 2);
  return y + 28;
}

function drawStatusBadge(doc, x, y, value) {
  const { label, color } = statusDisplay(value);
  const padding  = { x: 8, y: 3 };
  const fontSize = 9;

  doc.fontSize(fontSize).font("Helvetica-Bold");
  const textWidth = doc.widthOfString(label);
  const boxW      = textWidth + padding.x * 2;
  const boxH      = fontSize  + padding.y * 2;

  doc.save().roundedRect(x, y, boxW, boxH, 3).fill(color).restore();
  doc.font("Helvetica-Bold").fontSize(fontSize).fillColor("#FFFFFF")
     .text(label, x + padding.x, y + padding.y, { lineBreak: false });
  doc.fillColor(BRAND.primaryColor);
  return { width: boxW, height: boxH };
}

function drawFooter(doc, pageNum) {
  const y = PAGE.height - 40;
  drawRule(doc, y, BRAND.borderColor, 0.5);
  doc.font("Helvetica").fontSize(8).fillColor(BRAND.mutedColor);
  doc.text(
    "CONFIDENTIAL — This report is intended solely for the authorized recipient. Unauthorized disclosure is prohibited.",
    PAGE.margin, y + 8,
    { width: CONTENT_WIDTH - 60, lineBreak: false }
  );
  doc.text(`Page ${pageNum}`, PAGE.width - PAGE.margin - 30, y + 8, {
    width: 30, align: "right", lineBreak: false,
  });
}

// ─── Page 1 ───────────────────────────────────────────────────────────────────

function drawHeader(doc, reportId, generatedAt) {
  let y = PAGE.margin;

  if (LOGO_EXISTS) {
    doc.image(LOGO_PATH, PAGE.margin, y, { fit: [120, 40], align: "left", valign: "center" });
  } else {
    doc.save().rect(PAGE.margin, y, 40, 40).fill(BRAND.accentColor).restore();
    doc.font("Helvetica-Bold").fontSize(22).fillColor("#FFFFFF")
       .text("S", PAGE.margin + 10, y + 8, { lineBreak: false });
  }

  const nameX = LOGO_EXISTS ? PAGE.margin + 130 : PAGE.margin + 52;

  doc.font("Helvetica-Bold").fontSize(16).fillColor(BRAND.primaryColor)
     .text(BRAND.name, nameX, y + 2, { lineBreak: false });
  doc.font("Helvetica").fontSize(9).fillColor(BRAND.mutedColor)
     .text(BRAND.tagline, nameX, y + 22, { lineBreak: false });

  doc.font("Helvetica-Bold").fontSize(11).fillColor(BRAND.primaryColor)
     .text("VERIFICATION REPORT", PAGE.width - PAGE.margin - 140, y + 2, {
       width: 140, align: "right", lineBreak: false,
     });
  doc.font("Helvetica").fontSize(8).fillColor(BRAND.mutedColor)
     .text(`Generated: ${formatDate(generatedAt)}`, PAGE.width - PAGE.margin - 140, y + 18, {
       width: 140, align: "right", lineBreak: false,
     });
  doc.font("Helvetica").fontSize(8).fillColor(BRAND.mutedColor)
     .text(`Report ID: ${reportId}`, PAGE.width - PAGE.margin - 140, y + 30, {
       width: 140, align: "right", lineBreak: false,
     });

  y += 55;
  return drawRule(doc, y, BRAND.accentColor, 2);
}

function drawSummarySection(doc, y, row) {
  y = drawSectionHeading(doc, y, "Verification Summary");

  const badge1 = drawStatusBadge(doc, PAGE.margin, y, row.api_status);
  const badge2 = drawStatusBadge(doc, PAGE.margin + badge1.width + 8, y, row.status);
  const badgeH = Math.max(badge1.height, badge2.height);

  doc.font("Helvetica").fontSize(7).fillColor(BRAND.mutedColor)
     .text("API Status",      PAGE.margin,                    y + badgeH + 2, { lineBreak: false })
     .text("Document Status", PAGE.margin + badge1.width + 8, y + badgeH + 2, { lineBreak: false });

  y += badgeH + 18;
  y = drawRow(doc, y, "Verification ID",  row.id);
  y = drawRow(doc, y, "Document Type",    row.document_type);
  y = drawRow(doc, y,
    "Verified",
    row.verified === true ? "Yes" : row.verified === false ? "No" : "—",
    { valueColor: row.verified === true ? BRAND.successColor : BRAND.failedColor, bold: true }
  );

  if (row.failure_reason) {
    y = drawRow(doc, y, "Failure Reason", row.failure_reason, { valueColor: BRAND.failedColor });
  }

  y = drawRow(doc, y, "Retry Count",      String(row.retry_count ?? 0));
  y = drawRow(doc, y, "Request Created",  formatDate(row.created_at));
  y = drawRow(doc, y, "Last API Attempt", formatDate(row.last_api_attempt));
  y = drawRow(doc, y, "Result Processed", formatDate(row.processed_at));
  return y + 8;
}

function drawClientSection(doc, y, row) {
  y = drawSectionHeading(doc, y, "Client & Document Details");
  y = drawRow(doc, y, "Client Name", row.client_name ?? "—", { bold: true });
  y = drawRow(doc, y, "Client ID",   row.client_id);

  if (row.document_type === "GSTIN") {
    y = drawRow(doc, y, "Business Name", row.business_name ?? "—");
    y = drawRow(doc, y, "GSTIN",         row.document_number);
  } else if (row.document_type === "AADHAAR") {
    y = drawRow(doc, y, "Subject Name",     row.full_name ?? "—");
    y = drawRow(doc, y, "Aadhaar (masked)", row.document_number);
  } else {
    // PAN (default)
    y = drawRow(doc, y, "Subject Name", row.full_name ?? "—");
    y = drawRow(doc, y, "PAN Number",   row.document_number);
    if (row.dob) {
      let dobStr;
      if (typeof row.dob === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.dob)) {
        dobStr = row.dob;
      } else {
        const d = row.dob instanceof Date ? row.dob : new Date(row.dob);
        dobStr = isNaN(d.getTime())
          ? String(row.dob).slice(0, 10)
          : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      }
      y = drawRow(doc, y, "Date of Birth", dobStr);
    }
  }
  return y + 8;
}

// ─── Page 2+ : Raw data (paginated) ──────────────────────────────────────────
//
// THE FIX: Instead of computing the full JSON block height in one shot and
// drawing one giant rectangle (which caused PDFKit to silently add pages while
// y stayed wrong), we now:
//   1. Split the JSON into individual lines.
//   2. Greedily accumulate lines until they'd overflow the current page's
//      remaining space.
//   3. Render that chunk with a correctly-sized background rect.
//   4. Add an explicit page break and continue with the next chunk.
//   5. Return the real { y, pageNum } so the caller stays in sync.
//
// Result: y is always accurate, no phantom blank pages, footer always on the
// right page.
//
// @param  {PDFDocument} doc
// @param  {number}      startY     — current y cursor on entry
// @param  {object|null} resultData — parsed JSON from DB (may be null)
// @param  {number}      pageNum    — current page number on entry
// @returns {{ y: number, pageNum: number }}

function drawRawDataSection(doc, startY, resultData, pageNum) {
  let y = drawSectionHeading(doc, startY, "Raw API Response Data");

  // ── No data (failed / pending verification) ──────────────────────────────
  if (!resultData) {
    doc.font("Helvetica-Oblique").fontSize(10).fillColor(BRAND.mutedColor)
       .text(
         "No result data available. The verification may have failed before a response was received from IDfy.",
         PAGE.margin, y, { width: CONTENT_WIDTH }
       );
    return { y: y + 40, pageNum };
  }

  // ── Split JSON into individual lines ─────────────────────────────────────
  const allLines     = JSON.stringify(resultData, null, 2).split("\n");
  const PAD          = 10;
  const textWidth    = CONTENT_WIDTH - PAD * 2;
  let   remaining    = [...allLines];
  let   isFirstChunk = true;

  while (remaining.length > 0) {
    // Available vertical space on this page for a block (text + padding)
    const availH = USABLE_BOT - y - PAD * 2;

    // ── Find how many lines fit in availH ──────────────────────────────────
    // Walk forward until adding the next line would overflow.
    let fittedCount = 0;
    for (let n = 1; n <= remaining.length; n++) {
      const testText = remaining.slice(0, n).join("\n");
      const testH    = doc.heightOfString(testText, { width: textWidth, font: "Courier", size: 8 });
      if (testH > availH) break;
      fittedCount = n;
    }

    // Guard: always consume at least 1 line to avoid an infinite loop when a
    // single line is taller than the available space (extremely unlikely with
    // Courier 8, but defensive).
    if (fittedCount === 0) fittedCount = 1;

    const chunkLines = remaining.splice(0, fittedCount);
    const chunkText  = chunkLines.join("\n");
    const textH      = doc.heightOfString(chunkText, { width: textWidth, font: "Courier", size: 8 });
    const blockH     = textH + PAD * 2;

    // ── Draw background rect + border ─────────────────────────────────────
    doc.save().rect(PAGE.margin, y, CONTENT_WIDTH, blockH).fill("#F9FAFB").restore();
    doc.save()
       .rect(PAGE.margin, y, CONTENT_WIDTH, blockH)
       .lineWidth(0.5).strokeColor(BRAND.borderColor).stroke()
       .restore();

    // ── Render the chunk text ─────────────────────────────────────────────
    doc.font("Courier").fontSize(8).fillColor("#374151")
       .text(chunkText, PAGE.margin + PAD, y + PAD, { width: textWidth, lineBreak: true });

    y += blockH + 4;

    // ── If more lines remain, add a page break and a continuation label ───
    if (remaining.length > 0) {
      drawFooter(doc, pageNum);
      pageNum++;
      doc.addPage();
      y = PAGE.margin;

      // Small continuation label so the reader knows it's still raw data
      doc.font("Helvetica").fontSize(8).fillColor(BRAND.mutedColor)
         .text("Raw API Response Data (continued)", PAGE.margin, y, { lineBreak: false });
      y += 16;
    }

    isFirstChunk = false;
  }

  return { y: y + 8, pageNum };
}

// ─── Signature block ──────────────────────────────────────────────────────────

function drawSignatureBlock(doc, y, generatedAt) {
  y = drawSectionHeading(doc, y, "Authorisation & Signature");

  const colW  = (CONTENT_WIDTH - 20) / 2;
  const col2X = PAGE.margin + colW + 20;

  doc.font("Helvetica-Bold").fontSize(10).fillColor(BRAND.primaryColor)
     .text("Verified By", PAGE.margin, y);
  doc.font("Helvetica").fontSize(9).fillColor(BRAND.mutedColor)
     .text("Shovel Screening Solutions", PAGE.margin, y + 15)
     .text(BRAND.tagline,                PAGE.margin, y + 28)
     .text(`Date: ${formatDate(generatedAt)}`, PAGE.margin, y + 41);

  const sigLineY = y + 75;
  doc.moveTo(PAGE.margin, sigLineY)
     .lineTo(PAGE.margin + colW - 20, sigLineY)
     .lineWidth(0.5).strokeColor(BRAND.primaryColor).stroke();
  doc.font("Helvetica").fontSize(8).fillColor(BRAND.mutedColor)
     .text("Authorised Signatory", PAGE.margin, sigLineY + 4);

  doc.font("Helvetica-Bold").fontSize(10).fillColor(BRAND.primaryColor)
     .text("Declaration", col2X, y);
  doc.font("Helvetica").fontSize(8.5).fillColor(BRAND.mutedColor)
     .text(
       "This report has been generated by the BGV Platform operated by Shovel Screening " +
       "Solutions and reflects the verification result obtained from authorised government " +
       "data sources via IDfy Eve v3 API. The result is accurate as of the timestamp shown " +
       "and is provided for identity verification purposes only.",
       col2X, y + 15,
       { width: colW - 10 }
     );

  return sigLineY + 24;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * generateVerificationReport
 *
 * Writes the PDF to src/pdfs/ and resolves with the absolute file path.
 * reportController streams that file to the HTTP response.
 *
 * Page layout (guaranteed, no empty pages):
 *   Page 1          — Header + Verification Summary + Client & Document Details
 *   Page 2 (+ 2a…) — Raw API Response Data  (paginated if JSON is large)
 *   Last page       — Authorisation & Signature block
 *
 * @param   {object} row — Full verification record from reportController
 * @returns {Promise<string>} — Absolute path of the saved PDF
 */
function generateVerificationReport(row) {
  return new Promise((resolve, reject) => {
    const filename    = `bgv-report-${row.document_type.toLowerCase()}-${row.id}.pdf`;
    const filePath    = path.join(PDF_OUT_DIR, filename);

    const doc = new PDFDocument({
      size:    "A4",
      // bottom must be small so footer text at y=(PAGE.height-40)=802 stays
      // inside PDFKit's writable area (maxY = PAGE.height - margins.bottom).
      // With bottom=50 → maxY=792, footer at 802 > 792 → PDFKit auto-adds a
      // new page for every doc.text() call in drawFooter, producing 3 pages
      // per content page.  bottom=5 → maxY=837, footer at 802 < 837 → fixed.
      margins: { top: PAGE.margin, bottom: 5, left: PAGE.margin, right: PAGE.margin },
      info: {
        Title:   `BGV Verification Report — ${row.document_type} — ${row.id}`,
        Author:  BRAND.name,
        Subject: "Background Verification Report",
        Creator: "BGV Platform v1.3.2",
      },
    });

    const writeStream = fs.createWriteStream(filePath);
    writeStream.on("finish", () => {
      console.log(`[pdfReportService] ✅ Saved: ${filePath}`);
      resolve(filePath);
    });
    writeStream.on("error", (err) => {
      console.error(`[pdfReportService] ❌ Write error: ${err.message}`);
      reject(err);
    });

    doc.pipe(writeStream);

    const generatedAt = new Date();
    const reportId    = `RPT-${row.id.slice(0, 8).toUpperCase()}`;
    let   pageNum     = 1;

    // ── PAGE 1 : Header + Summary + Client Details ───────────────────────
    let y = drawHeader(doc, reportId, generatedAt);
    y += 8;
    y = drawSummarySection(doc, y, row);

    y = drawRule(doc, y, BRAND.borderColor, 0.5);
    y += 8;

    // Safety: if summary pushed us close to the bottom, start a fresh page
    // for the client section (very unlikely in practice, but defensive).
    const CLIENT_SECTION_EST = 130;
    if (y + CLIENT_SECTION_EST > USABLE_BOT) {
      drawFooter(doc, pageNum);
      pageNum++;
      doc.addPage();
      y = PAGE.margin;
    }

    y = drawClientSection(doc, y, row);
    drawFooter(doc, pageNum);

    // ── PAGE 2+ : Raw API data (paginated) ───────────────────────────────
    pageNum++;
    doc.addPage();
    y = PAGE.margin;

    const rawResult = drawRawDataSection(doc, y, row.result_data, pageNum);
    y       = rawResult.y;
    pageNum = rawResult.pageNum;

    // ── Signature block ───────────────────────────────────────────────────
    // Needs ~130 pt.  If it doesn't fit on the current page, start a new one.
    const SIG_HEIGHT = 130;
    if (y + SIG_HEIGHT > USABLE_BOT) {
      drawFooter(doc, pageNum);
      pageNum++;
      doc.addPage();
      y = PAGE.margin;
    } else {
      // Add a visual gap between raw data and signature
      y += 16;
    }

    drawSignatureBlock(doc, y, generatedAt);
    drawFooter(doc, pageNum);

    doc.end();
  });
}

module.exports = { generateVerificationReport, PDF_OUT_DIR };