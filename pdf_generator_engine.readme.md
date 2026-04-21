# BGV Platform — PDF Report Generation Engine

**Module Name:** PDF Report Generator
**Version:** 1.3.2
**Authors:** Niel Mandhare & Atharva Jadhav
**Company:** Shovel Screening Solutions
**Last Updated:** April 2026

---

## Table of Contents

1. [Purpose & Overview](#1-purpose--overview)
2. [File Map](#2-file-map)
3. [How It Works — End to End](#3-how-it-works--end-to-end)
4. [Page Layout Specification](#4-page-layout-specification)
5. [pdfReportService.js — Full Reference](#5-pdfreportservicejs--full-reference)
6. [reportController.js — Full Reference](#6-reportcontrollerjs--full-reference)
7. [reportRoutes.js — Full Reference](#7-reportroutesjs--full-reference)
8. [Document-Type Rendering Rules](#8-document-type-rendering-rules)
9. [The Page-Break System (Critical)](#9-the-page-break-system-critical)
10. [Brand & Style Constants](#10-brand--style-constants)
11. [Logo Handling](#11-logo-handling)
12. [Test Scripts](#12-test-scripts)
13. [Known Bugs Fixed (v1.3.2)](#13-known-bugs-fixed-v132)
14. [Adding a New Verification Type](#14-adding-a-new-verification-type)
15. [Future Enhancements](#15-future-enhancements)

---

## 1. Purpose & Overview

This module generates a **branded, multi-page PDF verification report** for every completed verification request on the BGV Platform. Reports are generated on-demand when a client hits the report endpoint — not pre-generated at verification time.

### What the Report Contains

Every PDF contains three logical sections across 2–3 pages:

1. **Verification Summary** — API status, document status badges, timestamps, retry count, failure reason if applicable
2. **Client & Document Details** — who submitted the request and what document was verified (PAN / Aadhaar / GSTIN with type-specific fields)
3. **Raw API Response Data** — the full normalised JSON stored in `verification_results.result_data`, rendered in a monospace code block
4. **Authorisation & Signature Block** — verified-by details, date, declaration text, and a signature line

### What It Does NOT Do

- It does **not** pre-generate PDFs at verification time (generation is on-demand only)
- It does **not** delete PDFs after streaming — `src/pdfs/` is a persistent store
- It does **not** email PDFs (future enhancement)
- It does **not** require a separate PDF microservice — it runs inside the main Express process using PDFKit

### Dependencies

```
pdfkit   — PDF generation (Node.js native, no external binaries needed)
fs       — File write stream
path     — Cross-platform path resolution
```

PDFKit is already in `package.json` as a production dependency. No additional install needed.

---

## 2. File Map

```
src/
├── services/
│   └── pdfReportService.js       ← CORE ENGINE — all drawing logic lives here
│
├── controllers/
│   └── reportController.js       ← DB fetch → call service → stream file to HTTP response
│
├── routes/
│   └── reportRoutes.js           ← GET /api/reports/:id  (protected by standard middleware)
│
├── pdfs/                         ← Output directory — auto-created at startup if missing
│   └── bgv-report-<type>-<uuid>.pdf   ← Saved reports (persistent — never auto-deleted)
│
└── assets/
    └── 2546_SHOVEL SCREENING SOLUTIONS_Logo Design_Dec23_ART.png  ← Company logo (PNG)

tests/
├── Test-PanReport.ps1            ← Real PAN flow → generates + opens PDF
├── Test-AadhaarReport.ps1        ← Aadhaar flow → PDF (shows failure reason when stubbed)
└── Test-GstinReport.ps1          ← GSTIN flow → PDF (shows failure reason when stubbed)
```

### Route Registration

The report route must be mounted in `src/routes/index.js`:

```js
const reportRoutes = require('./reportRoutes');
router.use('/reports', reportRoutes);
```

This places it at `GET /api/reports/:id`, behind the standard `apiKeyAuth + authMiddleware + tenantMiddleware` stack.

---

## 3. How It Works — End to End

```
Client
  │
  │  GET /api/reports/:id
  │  Headers: x-api-key + Authorization: Bearer <token>
  ▼
apiKeyAuth                         validates x-api-key header
  ▼
authMiddleware                     validates JWT, attaches req.user
  ▼
tenantMiddleware                   extracts tenant from JWT
  ▼
reportController.generateReport
  │
  │  SELECT vr.*, res.verified, res.result_data, res.processed_at, t.name AS client_name
  │  FROM verification_requests vr
  │  LEFT JOIN verification_results res ON res.verification_id = vr.id
  │  LEFT JOIN tenants t ON t.id = vr.client_id
  │  WHERE vr.id = $1
  │
  │  → 404 if not found
  ▼
pdfReportService.generateVerificationReport(row)
  │
  │  Creates PDFDocument (A4, PDFKit)
  │  Opens write stream → src/pdfs/bgv-report-<type>-<uuid>.pdf
  │
  │  PAGE 1:
  │    drawHeader()          logo + company name + report ID + generated timestamp
  │    drawSummarySection()  status badges + all timing/status fields
  │    drawClientSection()   type-specific fields (PAN / Aadhaar / GSTIN)
  │    drawFooter(1)         confidential notice + page number
  │
  │  PAGE 2 (+ overflow pages if JSON is large):
  │    drawRawDataSection()  chunked JSON rendering with per-page background rects
  │    drawFooter(N)         on each page
  │
  │  LAST PAGE (may be page 2 or page 3):
  │    drawSignatureBlock()  verified-by, declaration, signature line
  │    drawFooter(N)
  │
  │  doc.end() → write stream closes → Promise resolves with filePath
  ▼
reportController
  │
  │  Sets headers:
  │    Content-Type: application/pdf
  │    Content-Disposition: attachment; filename="bgv-report-pan-<uuid>.pdf"
  │    Cache-Control: no-store
  │
  │  fs.createReadStream(filePath).pipe(res)
  ▼
Client receives PDF download
```

---

## 4. Page Layout Specification

### Page Constants

```js
const PAGE = { margin: 50, width: 595, height: 842 };  // A4 in points
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;     // 495 pt
const USABLE_BOT = PAGE.height - 65;                    // 777 pt — content must stay above this
```

`USABLE_BOT` is the critical constant. No content is ever drawn below y=777. The footer occupies the zone between 777 and 842 (the page bottom). This prevents any section from bleeding into the footer area.

### Page Margin in PDFDocument Constructor

```js
margins: { top: 50, bottom: 5, left: 50, right: 50 }
```

> ⚠️ `bottom` MUST be `5`, not `50`.
> PDFKit auto-adds a new page whenever `doc.text()` is called at a y position exceeding `PAGE.height - margins.bottom`.
> With `bottom: 50`, the boundary is `792`. The footer draws at `PAGE.height - 40 = 802` which is past 792, causing PDFKit to generate a phantom extra page for each `doc.text()` call in the footer.
> With `bottom: 5`, the boundary is `837`. Footer at `802 < 837` — no phantom pages.
> See [Section 13](#13-known-bugs-fixed-v132) for the full bug history.

### Layout Per Page

```
y =  50  ┌─────────────────────────────────────────────┐
         │  Logo   │  Company Name / Tagline            │  VERIFICATION REPORT
         │         │                                    │  Generated: ...
         │         │                                    │  Report ID: ...
y = 117  ├═════════════════════════════════════════════╡  ← accent rule (2pt, red)
         │
         │  Verification Summary  (section heading)
         │    [SUCCESS] [VERIFIED]  ← status badges
         │    Verification ID  : ...
         │    Document Type    : ...
         │    Verified         : Yes / No
         │    Failure Reason   : ...  (only if present)
         │    Retry Count      : ...
         │    Request Created  : ...
         │    Last API Attempt : ...
         │    Result Processed : ...
         │
         ├─────────────────────────────────────────────┤  ← divider rule (0.5pt, grey)
         │
         │  Client & Document Details  (section heading)
         │    Client Name  : ...      ← from tenants JOIN
         │    Client ID    : ...
         │    [PAN]    Subject Name / PAN Number / Date of Birth
         │    [AADHAAR] Subject Name / Aadhaar (masked)
         │    [GSTIN]   Business Name / GSTIN
         │
y = 802  ├─────────────────────────────────────────────┤  ← footer rule
         │  CONFIDENTIAL notice                        │  Page 1
y = 842  └─────────────────────────────────────────────┘
```

---

## 5. pdfReportService.js — Full Reference

### Exports

```js
module.exports = { generateVerificationReport, PDF_OUT_DIR };
```

| Export | Type | Description |
|---|---|---|
| `generateVerificationReport(row)` | `Promise<string>` | Main entry point. Takes the DB row, generates the PDF, returns the absolute file path |
| `PDF_OUT_DIR` | `string` | Absolute path to `src/pdfs/` — exported so other modules can reference the output directory |

### Path Resolution

```js
const SRC_DIR     = path.resolve(__dirname, "..");           // src/
const LOGO_PATH   = path.join(SRC_DIR, "assets", "<logo filename>");
const PDF_OUT_DIR = path.join(SRC_DIR, "pdfs");
```

`__dirname` is the `src/services/` directory. One `..` resolves to `src/`. The logo and PDF output directory are always resolved relative to `src/`, regardless of where the process was started from.

### Startup Checks

These run once when `pdfReportService.js` is first `require()`'d (i.e., at server start):

```js
// Creates src/pdfs/ if it doesn't exist
if (!fs.existsSync(PDF_OUT_DIR)) {
  fs.mkdirSync(PDF_OUT_DIR, { recursive: true });
}

// Logs logo status to console — useful when debugging branding issues
const LOGO_EXISTS = fs.existsSync(LOGO_PATH);
console.log(`[pdfReportService] Logo path : ${LOGO_PATH}`);
console.log(`[pdfReportService] Logo found: ${LOGO_EXISTS}`);
console.log(`[pdfReportService] PDF outdir: ${PDF_OUT_DIR}`);
```

Check your server console for these lines immediately after starting the dev server. `Logo found: false` means the PNG is missing or misnamed — the PDF still generates, but uses the "S" fallback box instead of the real logo.

### Drawing Functions

Every drawing function takes `(doc, y, ...)` and returns the new `y` position after drawing, except `drawRawDataSection` which also takes and returns a `pageNum`.

| Function | Returns | Description |
|---|---|---|
| `drawHeader(doc, reportId, generatedAt)` | `y` | Logo, company name, tagline, report ID, generated timestamp, accent rule |
| `drawSummarySection(doc, y, row)` | `y` | Status badges, all verification_request fields |
| `drawClientSection(doc, y, row)` | `y` | Client name/ID + document-type-specific fields |
| `drawRawDataSection(doc, y, resultData, pageNum)` | `{ y, pageNum }` | Paginated JSON code block |
| `drawSignatureBlock(doc, y, generatedAt)` | `y` | Two-column: Verified By + Declaration |
| `drawFooter(doc, pageNum)` | `void` | Confidential notice + page number at fixed y=802 |
| `drawSectionHeading(doc, y, title)` | `y` | Red left-bar accent + bold title |
| `drawRow(doc, y, label, value, opts)` | `y` | Single label-value row (muted label, coloured value) |
| `drawStatusBadge(doc, x, y, value)` | `{ width, height }` | Coloured rounded-rect badge with white text |
| `drawRule(doc, y, color, thickness)` | `y` | Horizontal rule across full content width |

### Helper Functions

| Function | Description |
|---|---|
| `formatDate(val)` | Handles `Date` objects, ISO strings, null → returns readable UTC string or `"—"` |
| `statusDisplay(value)` | Maps status string to `{ label, color }` for badge rendering |

---

## 6. reportController.js — Full Reference

**File location:** `src/controllers/reportController.js`

### What It Does

1. Extracts `:id` from `req.params`
2. Runs a JOIN query across `verification_requests`, `verification_results`, and `tenants`
3. Returns `404` if no row found
4. Calls `generateVerificationReport(row)` from the service
5. Streams the saved file back as `application/pdf`

### DB Query

```sql
SELECT
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
WHERE vr.id = $1
```

The `LEFT JOIN` on `verification_results` means the query succeeds even if the verification has no result yet (pending/failed before IDfy responded). In that case, `res.result_data` is `null` and the PDF shows "No result data available."

The `LEFT JOIN` on `tenants` means `client_name` is `null` if the client_id doesn't match any tenant row — the PDF shows `"—"` in that case.

### HTTP Response Headers

```
Content-Type:        application/pdf
Content-Disposition: attachment; filename="bgv-report-pan-<uuid>.pdf"
Cache-Control:       no-store
```

`attachment` forces a browser download dialog rather than inline rendering.
`no-store` prevents the browser from caching the PDF.

### Error Handling

| Scenario | Response |
|---|---|
| UUID not found in DB | `404 { success: false, message: "Verification not found" }` |
| DB query throws | Passed to `next(err)` → global error handler |
| PDF generation throws | Passed to `next(err)` → global error handler |
| File read stream error | `res.destroy(err)` — headers already sent, can't send JSON |

---

## 7. reportRoutes.js — Full Reference

**File location:** `src/routes/reportRoutes.js`

```js
const express          = require("express");
const router           = express.Router();
const reportController = require("../controllers/reportController");

router.get("/:id", reportController.generateReport);

module.exports = router;
```

This router is mounted in `src/routes/index.js` under `/reports`, making the full path `GET /api/reports/:id`.

### Middleware Applied (inherited from index.js)

```
apiKeyAuth        ← x-api-key header must be present and valid
authMiddleware    ← Authorization: Bearer <token> must be valid JWT
tenantMiddleware  ← tenant extracted from JWT
```

The report endpoint is intentionally protected behind the full middleware stack. Only authenticated users with a valid tenant context can generate reports.

---

## 8. Document-Type Rendering Rules

`drawClientSection` branches on `row.document_type` to render the appropriate fields. The three cases are:

### PAN

```
Client Name    : <from tenants JOIN>
Client ID      : <UUID>
Subject Name   : <full_name from verification_requests>
PAN Number     : <document_number>
Date of Birth  : <dob — YYYY-MM-DD format>
```

**DOB formatting detail:** PostgreSQL returns `dob` as either a plain `"YYYY-MM-DD"` string (most cases) or a `Date` object (some server timezone configs). The code handles both:

```js
if (typeof row.dob === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.dob)) {
  dobStr = row.dob;  // use as-is
} else {
  // Date object — use local getters to avoid UTC offset shifting the date by 1 day
  const d = row.dob instanceof Date ? row.dob : new Date(row.dob);
  dobStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
```

> Do NOT use `d.toISOString()` for DOB. On IST servers (UTC+5:30), it shifts the date back by one day.

### AADHAAR

```
Client Name       : <from tenants JOIN>
Client ID         : <UUID>
Subject Name      : <full_name>
Aadhaar (masked)  : <document_number — always XXXX-XXXX-NNNN format>
```

The full 12-digit Aadhaar number is never accepted, stored, or rendered. The Joi validator enforces the `XXXX-XXXX-NNNN` format at submission time. The PDF renders exactly what was stored.

### GSTIN

```
Client Name    : <from tenants JOIN>
Client ID      : <UUID>
Business Name  : <business_name — stored locally, never sent to IDfy>
GSTIN          : <document_number — 15-char GSTIN>
```

`business_name` is stored in `verification_requests.business_name` at submission time. IDfy's `ind_gstin` endpoint does not support server-side name matching, so the name is for record-keeping only. To verify it, compare against `legal_name` / `trade_name` in the IDfy result on page 2.

---

## 9. The Page-Break System (Critical)

This is the most important architectural detail. Getting it wrong produces blank pages. Getting it right guarantees a clean 2–3 page PDF every time.

### The Core Rule

> **y must always reflect the real cursor position on the real current page.**

PDFKit draws at absolute coordinates. It does not automatically track whether your y value has gone past the page boundary. If you tell it to draw at y=900 on an A4 page (842pt tall), it silently adds a new page and renders there — but your y variable still says 900, which is now wrong for the new page. Every subsequent draw call is then wrong.

### USABLE_BOT

```js
const USABLE_BOT = PAGE.height - 65;  // 777
```

Before drawing any section, the code checks whether that section fits in the remaining space:

```js
if (y + estimatedSectionHeight > USABLE_BOT) {
  drawFooter(doc, pageNum);
  pageNum++;
  doc.addPage();
  y = PAGE.margin;  // reset y to top of new page
}
```

This check is used:
- Between the summary section and client section (unlikely to trigger, but defensive)
- Before the signature block (common when raw data is substantial)

### drawRawDataSection — Chunked Rendering

The raw JSON can be any size. The old code drew one giant rectangle for the entire JSON and let PDFKit internally paginate the text, causing y to go off-page. The fix splits the JSON into line-by-line chunks:

```
allLines = JSON.stringify(resultData, null, 2).split("\n")
remaining = [...allLines]

WHILE remaining has lines:
  availH = USABLE_BOT - y - (2 × PAD)     ← space left on current page

  FOR n = 1 to remaining.length:
    testH = heightOfString(remaining[0..n].join("\n"))
    IF testH > availH: break
    fittedCount = n

  chunkLines = remaining.splice(0, fittedCount)   ← consume fitted lines
  draw background rect at correct height
  draw text
  y += blockH

  IF remaining still has lines:
    drawFooter(doc, pageNum)
    pageNum++
    doc.addPage()
    y = PAGE.margin
    draw "Raw API Response Data (continued)" label
    y += 16
```

After this loop, `y` and `pageNum` are both accurate. The signature block check that follows is therefore reliable.

### Page Number Tracking

`pageNum` starts at `1` and is passed explicitly to every `drawFooter()` call and through `drawRawDataSection`. The caller receives the updated `pageNum` back:

```js
const rawResult = drawRawDataSection(doc, y, row.result_data, pageNum);
y       = rawResult.y;
pageNum = rawResult.pageNum;
```

This is the correct pattern. Do not use PDFKit's internal page tracking — it is not exposed and cannot be relied upon when you're manually managing page breaks.

### Expected Page Count by Scenario

| Scenario | Expected Pages |
|---|---|
| PAN — success (normal IDfy response ~15 fields) | **2** |
| PAN — failed (null result_data) | **2** |
| Aadhaar — stubbed (null result_data) | **2** |
| GSTIN — stubbed (null result_data) | **2** |
| Any type — success with very large result_data | **3** (raw data spills to page 3, signature on page 3) |
| Any type — success with extremely large result_data | **4+** (each raw data continuation page gets a footer) |

---

## 10. Brand & Style Constants

```js
const BRAND = {
  name:         "Shovel Screening Solutions",
  tagline:      "Background Verification Platform",
  primaryColor: "#1A1A2E",   // dark navy — headings, body text, labels
  accentColor:  "#E94560",   // red — section heading bars, header rule, logo fallback
  mutedColor:   "#6B7280",   // grey — row labels, footer text, metadata
  successColor: "#10B981",   // green — SUCCESS / VERIFIED badges, "Yes" verified field
  failedColor:  "#EF4444",   // red   — FAILED badge, "No" verified field, failure reason
  pendingColor: "#F59E0B",   // amber — PENDING / PROCESSING / RETRYING badges
  borderColor:  "#E5E7EB",   // light grey — horizontal rules, table borders, code block border
};
```

### Status Badge Color Mapping

| Status string | Badge label | Color |
|---|---|---|
| `success` | SUCCESS | `#10B981` green |
| `verified` | VERIFIED | `#10B981` green |
| `failed` | FAILED | `#EF4444` red |
| `pending` | PENDING | `#F59E0B` amber |
| `processing` | PROCESSING | `#F59E0B` amber |
| `retrying` | RETRYING | `#F59E0B` amber |
| anything else | uppercased as-is | `#6B7280` grey |

### Raw Data Code Block Style

```
Background fill: #F9FAFB  (very light grey)
Border:          #E5E7EB  0.5pt stroke
Font:            Courier  8pt
Text color:      #374151  (dark grey)
Padding:         10pt all sides
```

---

## 11. Logo Handling

### Expected File

```
src/assets/2546_SHOVEL SCREENING SOLUTIONS_Logo Design_Dec23_ART.png
```

The filename must match exactly (spaces and underscores included). The path is resolved at module load time and stored in `LOGO_EXISTS`.

### When Logo Is Found (`LOGO_EXISTS = true`)

```js
doc.image(LOGO_PATH, PAGE.margin, y, { fit: [120, 40], align: "left", valign: "center" });
```

The image is fitted into a 120×40 point bounding box. The aspect ratio is preserved — the image will not stretch.

Company name text is then offset 130pt from the left margin to clear the logo:
```js
const nameX = PAGE.margin + 130;  // 180pt from page edge
```

### When Logo Is Missing (`LOGO_EXISTS = false`) — Fallback

A 40×40 red box with a white "S" initial is drawn instead:

```js
doc.save().rect(PAGE.margin, y, 40, 40).fill(BRAND.accentColor).restore();
doc.font("Helvetica-Bold").fontSize(22).fillColor("#FFFFFF")
   .text("S", PAGE.margin + 10, y + 8, { lineBreak: false });
```

Company name offset is reduced to 52pt to sit closer to the smaller fallback box:
```js
const nameX = PAGE.margin + 52;   // 102pt from page edge
```

The PDF is still fully usable with the fallback. Fix by placing the PNG at the correct path and restarting the server.

---

## 12. Test Scripts

Three separate PowerShell scripts are provided, one per document type. Each follows the same 4-step pattern.

### Test Script Pattern

```
Step 1 — Login       → get access token
Step 2 — Submit      → POST to verification endpoint, get verification ID
Step 3 — Poll        → GET /api/verifications/:id until api_status leaves pending/processing
Step 4 — Download PDF → GET /api/reports/:id, save to $env:TEMP, open automatically
```

### Test-PanReport.ps1

**Fill in at the top:**
```powershell
$REAL_PAN  = "ABCDE1234F"          # your actual PAN number
$REAL_NAME = "YOUR NAME"           # exactly as printed on PAN card
$REAL_DOB  = "YYYY-MM-DD"          # date of birth
```

Expects `api_status = success` from IDfy. Prints full IDfy result (lookup_status, pan_status, name_match, aadhaar_linked) before generating the PDF.

### Test-AadhaarReport.ps1

**Fill in at the top:**
```powershell
$MASKED_AADHAAR = "XXXX-XXXX-NNNN"   # replace NNNN with your real last 4 Aadhaar digits
$FULL_NAME      = "YOUR NAME"          # exactly as on Aadhaar card
```

**Preflight validation:** The script validates the `XXXX-XXXX-NNNN` format before hitting the server. Exits with a clear error message if the format is wrong.

Currently expects `api_status = failed` because `ind_aadhaar` is not enabled on the IDfy test account. The PDF still generates and shows the failure reason. Once the account is upgraded, `api_status = success` is handled automatically.

### Test-GstinReport.ps1

**Fill in at the top:**
```powershell
$GSTIN         = "27AABCU9603R1ZM"          # your actual 15-character GSTIN
$BUSINESS_NAME = "Your Registered Business"  # for local records only
```

**GSTIN format:** `[2-digit state code][5-letter PAN][4 digits][1 letter][1 alphanumeric]Z[1 alphanumeric]`
Example: `27` (Maharashtra) + `AABCU9603R` (PAN) + `1` + `Z` + `M` = `27AABCU9603R1ZM`

**Preflight validation:** Validates the 15-char GSTIN regex before hitting the server.

Currently expects `api_status = failed` for the same IDfy account tier reason as Aadhaar.

### Running a Test

```powershell
# From the project root, PowerShell only (Windows)
.\tests\Test-PanReport.ps1
.\tests\Test-AadhaarReport.ps1
.\tests\Test-GstinReport.ps1
```

PDFs are saved to two locations:
- `$env:TEMP\bgv-report-<type>-<uuid>.pdf` — opened automatically by `Start-Process`
- `src/pdfs/bgv-report-<type>-<uuid>.pdf` — persistent project copy

---

## 13. Known Bugs Fixed (v1.3.2)

### Bug 1 — 9-Page PDF (Footer Pagination Bug)

**Symptom:** A successful PAN verification produced a 9-page PDF. The actual content was 3 pages. The 6 extra pages each contained only a single line of footer text.

**Root cause:** The `PDFDocument` was created with `margins.bottom = 50`. PDFKit's bottom boundary is `PAGE.height - margins.bottom = 842 - 50 = 792`. The footer draws at `PAGE.height - 40 = 802`. Every `doc.text()` call in `drawFooter()` targeted y=810 (802 + 8), which exceeded 792. PDFKit auto-added a new page before rendering each call. `drawFooter` has 2 text calls → 2 phantom pages per content page → 3 content pages × 3 = 9 pages total.

**Fix:** Change `margins.bottom` from `50` to `5`. New boundary: `842 - 5 = 837`. Footer at `802 < 837` → no phantom pages.

```js
// BEFORE (broken)
margins: { top: 50, bottom: 50, left: 50, right: 50 }

// AFTER (fixed)
margins: { top: 50, bottom: 5,  left: 50, right: 50 }
```

---

### Bug 2 — 6-Page PDF (Raw Data Overflow Bug)

**Symptom:** PDF had 6 pages total. Pages 3, 4, 5 had raw JSON text with no background styling. Page 6 had only the signature block. Some pages appeared blank or had only partial content.

**Root cause:** `drawRawDataSection` pre-calculated the full JSON block height (e.g., 900pt), drew a single rectangle at that height (extending past the page boundary), then called `doc.text()` which PDFKit automatically paginated across pages 3–5. The function's returned `y` value was the pre-calculated height (900pt), not the real cursor position. Subsequent calls checked `y + 120 > USABLE_BOT`, which was always true (900 + 120 >> 777), so every verification added an extra page for the signature block.

**Fix:** Replace the single-block draw with a chunked line-by-line approach. Lines are accumulated until they'd overflow the current page, then flushed with a correctly-sized rectangle. An explicit page break is inserted, and the function returns the real `{ y, pageNum }`.

**Result:** y is always accurate. No PDFKit-internal page additions. Signature block check is reliable. Clean 2-page PDF for standard PAN responses.

---

## 14. Adding a New Verification Type

When a new document type is added (e.g., Driving Licence, Passport), follow these steps:

### Step 1 — Add a branch in `drawClientSection`

```js
function drawClientSection(doc, y, row) {
  y = drawSectionHeading(doc, y, "Client & Document Details");
  y = drawRow(doc, y, "Client Name", row.client_name ?? "—", { bold: true });
  y = drawRow(doc, y, "Client ID",   row.client_id);

  if (row.document_type === "GSTIN") {
    // ... existing
  } else if (row.document_type === "AADHAAR") {
    // ... existing
  } else if (row.document_type === "DL") {         // ← add new branch
    y = drawRow(doc, y, "Licence Holder", row.full_name ?? "—");
    y = drawRow(doc, y, "DL Number",      row.document_number);
    y = drawRow(doc, y, "Date of Birth",  dobStr);
    y = drawRow(doc, y, "State",          row.state ?? "—");
  } else {
    // PAN fallback
  }
  return y + 8;
}
```

### Step 2 — The rest is automatic

- `drawSummarySection` is document-type agnostic — works without changes
- `drawRawDataSection` renders whatever is in `result_data` — works without changes
- The PDF filename uses `row.document_type.toLowerCase()` — will produce `bgv-report-dl-<uuid>.pdf` automatically

### Step 3 — Add a test script

Copy `Test-PanReport.ps1`, rename to `Test-DlReport.ps1`, change the submission endpoint and body fields.

---

## 15. Future Enhancements

| Enhancement | Detail |
|---|---|
| Email delivery | Add a `sendReportByEmail(filePath, recipientEmail)` call after PDF generation in the controller |
| Pre-generation at verification time | Call `generateVerificationReport` inside `responseProcessor.js` after writing `verification_results`, so the PDF is ready before the client even requests it |
| Auto-cleanup of old PDFs | A cron job in `src/jobs/pdfJob.js` could delete files older than N days from `src/pdfs/` |
| S3 / cloud storage | Replace `fs.createWriteStream` with an S3 `putObject` call; replace `fs.createReadStream` with S3 `getObject` stream in the controller |
| Watermarking unverified reports | Add a diagonal "UNVERIFIED" watermark in `drawRawDataSection` when `row.verified === false` |
| QR code on report | Embed a QR code linking to a public verification status URL so recipients can self-verify the report |
| PDF password protection | PDFKit supports `doc.encrypt({ userPassword, ownerPassword })` — add as an optional controller param |
| Multi-language support | Replace hardcoded English strings with a locale lookup map; pass `locale` as a param to `generateVerificationReport` |
