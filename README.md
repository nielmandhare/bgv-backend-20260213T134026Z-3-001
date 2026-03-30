# BGV Backend — Background Verification Platform API

**Authors:** Atharva Jadhav & Niel Mandhare
**Company:** Shovel Screening Solutions
**Version:** 1.2.0
**Runtime:** Node.js + Express.js
**Database:** PostgreSQL
**Entry point:** `server.js`
**Third-party API:** IDfy Eve v3 REST API (`https://eve.idfy.com`)
**Last Updated:** March 30, 2026

---

## Table of Contents

1. [Project Purpose & Current Status](#1-project-purpose--current-status)
2. [Architecture Overview](#2-architecture-overview)
3. [Project Structure](#3-project-structure)
4. [Tech Stack & Dependencies](#4-tech-stack--dependencies)
5. [Environment Variables](#5-environment-variables)
6. [Database Schema](#6-database-schema)
7. [Startup & Boot Sequence](#7-startup--boot-sequence)
8. [Security Middleware Stack](#8-security-middleware-stack)
9. [Authentication System](#9-authentication-system)
10. [API Routes Reference](#10-api-routes-reference)
11. [Verification Lifecycle](#11-verification-lifecycle)
12. [IDfy Integration — Complete Technical Reference](#12-idfy-integration--complete-technical-reference)
13. [Retry Mechanism](#13-retry-mechanism)
14. [Multi-Tenant Support](#14-multi-tenant-support)
15. [File Upload](#15-file-upload)
16. [Bulk Upload](#16-bulk-upload)
17. [Error Handling](#17-error-handling)
18. [Logging](#18-logging)
19. [Input Validation](#19-input-validation)
20. [Installation & Local Setup](#20-installation--local-setup)
21. [Scripts](#21-scripts)
22. [Testing](#22-testing)
23. [Known Limitations & Blockers](#23-known-limitations--blockers)
24. [Future Enhancements](#24-future-enhancements)
25. [Implemented Modules (Sprint Tracker)](#25-implemented-modules-sprint-tracker)
26. [Changelog](#26-changelog)

---

## 1. Project Purpose & Current Status

This is the backend for a **Background Verification (BGV) Platform** built for Shovel Screening Solutions. It allows organizations to submit and track identity verification requests for Indian documents — PAN cards, Aadhaar, and GSTIN numbers. The system is **multi-tenant**: multiple client organizations share one deployed instance while their data stays completely isolated.

### What's Working Right Now

| Feature | Status |
|---|---|
| PAN Verification | ✅ Fully working end-to-end with live IDfy API |
| Aadhaar Verification | ✅ Code 100% complete — blocked only by IDfy account tier |
| GSTIN Verification | ✅ Code 100% complete — blocked only by IDfy account tier |
| JWT Authentication | ✅ Complete |
| Multi-tenant isolation | ✅ Complete |
| File Upload | ✅ Complete |
| Bulk Upload (CSV/Excel) | ✅ Complete |
| Retry Mechanism | ✅ Complete (status update only — re-trigger is future work) |

### How Verification Works (High-Level)

Verification is **fire-and-forget async**:
1. Client sends a POST request with document details.
2. Server immediately returns HTTP 201 — the client is not kept waiting.
3. In the background, the server calls IDfy's API.
4. The database is updated with the result.
5. Client polls `GET /api/verifications/:id` to check the outcome.

All API failures are stored in `failure_reason` so nothing is lost silently.

---

## 2. Architecture Overview

```
Client Request
    ↓
server.js              ← loads .env, validates required vars, starts HTTP server
    ↓
src/app.js             ← applies all middleware in order, mounts routes
    ↓
Middleware Stack        ← Helmet → CORS → Compression → Body Parser → Logger
                          → Rate Limiter (global + API-level) → API Key Auth
    ↓
src/routes/            ← Route definitions (auth is public; all else requires JWT + tenant)
    ↓
src/middlewares/       ← authMiddleware (JWT verify) → tenantMiddleware (extract tenant)
    ↓
src/controllers/verificationController.js
    ↓
  INSERT into verification_requests (api_status = 'pending')
    ↓
  Fire-and-forget async runner (HTTP 201 returned to client here)
    ↓
src/services/thirdPartyService.js   ← builds IDfy request body, fires the call
    ↓
src/utils/apiClient.js              ← Axios instance with IDfy auth headers
    ↓
IDfy Eve v3 REST API (https://eve.idfy.com)
    ↓
src/services/responseProcessor.js  ← normalises raw IDfy response
    ↓
src/services/vendorMappings/idfyMapping.js  ← field path definitions for IDfy v3 shape
    ↓
INSERT into verification_results
UPDATE verification_requests (api_status = 'success' | 'failed')
    ↓
PostgreSQL — bgv_platform database
```

### Key Design Decisions

- **Non-blocking API calls** — clients get HTTP 201 instantly; IDfy call runs in the background.
- **Service layer abstraction** — all third-party calls go through `thirdPartyService.js`, never directly from controllers.
- **Reusable API client** — `apiClient.js` centralizes IDfy's base URL, auth headers, and Axios interceptors.
- **Error traceability** — all IDfy failures are logged to Winston AND written to `failure_reason` in the DB.
- **Vendor-agnostic mapping** — `vendorMappings/` allows swapping IDfy for another provider (Gridlines stub already exists) without changing controllers.

---

## 3. Project Structure

```
bgv-backend/
│
├── server.js                    ← HTTP server bootstrap (loads env, validates, starts)
│
├── src/
│   ├── app.js                   ← Express app: middleware chain + route mounting
│   │                              Also registers process.on('uncaughtException') guards
│   │
│   ├── config/
│   │   └── multerConfig.js      ← Multer file upload config (type + size validation)
│   │
│   ├── controllers/             ← Request handlers. Each controller calls next(error) for failures.
│   │   ├── authController.js            ← login, refreshToken, logout
│   │   ├── uploadController.js          ← single file upload handler
│   │   ├── verificationController.js    ← PAN/Aadhaar/GSTIN intake, retry, getById
│   │   │                                  Also contains extractErrorMessage() helper
│   │   ├── tenantController.js          ← tenant CRUD
│   │   ├── bulkUploadController.js      ← CSV/Excel batch upload
│   │   ├── consentController.js         ← consent record management
│   │   └── webhookController.js         ← inbound webhook handling
│   │
│   ├── routes/
│   │   ├── index.js             ← Master router — applies authMiddleware + tenantMiddleware
│   │   │                          to everything except /auth, /webhooks, /health
│   │   ├── authRoutes.js        ← POST /login, /refresh, /logout
│   │   ├── verificationRoutes.js← POST /pan, /aadhaar, /gstin, /retry/:id, GET /:id
│   │   ├── uploadRoutes.js      ← POST /upload
│   │   ├── tenantRoutes.js      ← GET/POST /tenants
│   │   ├── bulkUploadRoutes.js  ← POST /bulk-upload
│   │   ├── consentRoutes.js     ← Consent management
│   │   ├── documentRoutes.js    ← Document management
│   │   ├── auditRoutes.js       ← Audit log access
│   │   └── webhookRoutes.js     ← POST /webhooks (public — no JWT)
│   │
│   ├── middlewares/
│   │   ├── apiKeyAuth.js        ← Validates x-api-key header on all /api/* routes
│   │   ├── authMiddleware.js    ← Validates JWT Bearer token; attaches req.user
│   │   ├── roleMiddleware.js    ← RBAC: accepts array of allowed roles
│   │   ├── errorMiddleware.js   ← 404 handler + global error handler
│   │   ├── tenantMiddleware.js  ← Extracts and verifies tenant from JWT
│   │   ├── validate.js          ← Joi schema validation wrapper middleware
│   │   ├── bulkUploadMiddleware.js  ← CSV/Excel parse + row validation
│   │   ├── consentMiddleware.js     ← Consent verification
│   │   ├── auditMiddleware.js       ← Request audit logging
│   │   ├── createBatchMiddleware.js ← Batch creation logic
│   │   └── requestLogger.js         ← Per-request logging
│   │
│   ├── validator/
│   │   ├── verificationValidator.js ← Joi schemas: panSchema, aadhaarSchema, gstinSchema
│   │   ├── authValidator.js         ← Joi schemas for login/register
│   │   └── userValidator.js         ← Joi schemas for user fields
│   │
│   ├── models/                  ← Thin data-access wrappers (not an ORM)
│   │   ├── User.js              ← findByEmail(), findById()
│   │   ├── BaseModel.js         ← Shared model helpers
│   │   ├── Document.js
│   │   ├── Tenant.js
│   │   ├── AuditLog.js
│   │   ├── BulkUploadBatch.js
│   │   ├── ConsentRecord.js
│   │   ├── VerificationRequest.js
│   │   ├── VerificationResult.js
│   │   ├── Report.js
│   │   └── RefreshToken.js
│   │
│   ├── services/
│   │   ├── thirdPartyService.js     ← Builds IDfy request bodies, fires calls, runs _assertResult
│   │   │                              Contains: verifyPAN(), verifyAadhaar(), verifyGSTIN()
│   │   │                              Contains: normaliseDob(), normaliseAadhaar() helpers
│   │   ├── bulkUploadService.js     ← Orchestrates row-by-row bulk processing
│   │   ├── responseProcessor.js     ← Calls idfyMapping, extracts fields, determines verified boolean
│   │   └── vendorMappings/
│   │       ├── idfyMapping.js       ← IDfy v3 dot-notation field paths + transform()
│   │       │                          Covers PAN, Aadhaar, GSTIN
│   │       ├── gridlinesMapping.js  ← Stub for future Gridlines vendor support
│   │       └── index.js             ← Vendor mapper registry
│   │
│   ├── utils/
│   │   ├── db.js                ← pg.Pool, query(), tenantQuery(), verifyTenantOwnership()
│   │   │                          ⚠️ Has hardcoded dev fallback — must fix before production
│   │   ├── apiClient.js         ← Axios instance: base URL, api-key + account-id headers, interceptors
│   │   ├── apiResponse.js       ← Builds standard { success, message, data } response shape
│   │   ├── logger.js            ← Winston logger (file + console transports)
│   │   ├── auditLogger.js       ← Structured compliance audit trail logger
│   │   ├── csvParser.js         ← CSV row parser
│   │   ├── excelParser.js       ← Excel/XLSX row parser
│   │   ├── consentValidator.js  ← Consent status check
│   │   ├── confidenceCalculator.js ← Verification confidence scoring
│   │   ├── constants.js         ← Shared constants
│   │   └── logViewer.js         ← Log file reader utility
│   │
│   ├── migrations/
│   │   └── 001_init.sql         ← Full DB schema — run this manually on first setup
│   │
│   ├── jobs/                    ← Background job stubs (none are running yet)
│   │   ├── notificationJob.js   ← Future: notification scheduling
│   │   ├── pdfJob.js            ← Future: PDF report generation
│   │   └── vendorJob.js         ← Future: auto-retry + vendor API polling
│   │
│   └── tests/
│       └── testTenantIsolation.js  ← Manual test script for multi-tenant data isolation
│
├── uploads/               ← Temporary file storage (UUID-named subdirs per session)
├── logs/                  ← Daily rotating logs (YYYY-MM-DD.log + error.log)
├── .env.development       ← Dev secrets — NEVER commit this file
├── .eslintrc.js
├── .prettierrc
└── package.json
```

---

## 4. Tech Stack & Dependencies

### Production Dependencies

| Package | Version | Purpose |
|---|---|---|
| `express` | ^4.18.2 | HTTP framework |
| `pg` | ^8.11.0 | PostgreSQL client (connection pooling via `pg.Pool`) |
| `axios` | latest | HTTP client for IDfy API calls |
| `jsonwebtoken` | ^9.0.3 | JWT access + refresh token generation and verification |
| `bcrypt` | ^6.0.0 | Password hashing (native binding) |
| `bcryptjs` | ^3.0.3 | Pure-JS bcrypt fallback |
| `joi` | ^18.0.2 | Schema-based input validation |
| `express-rate-limit` | ^8.3.1 | Request rate limiting |
| `helmet` | ^8.1.0 | Security HTTP headers |
| `cors` | ^2.8.5 | Cross-Origin Resource Sharing |
| `compression` | ^1.8.1 | Gzip response compression |
| `morgan` | ^1.10.1 | HTTP request logging |
| `multer` | ^2.1.1 | Multipart file upload handling |
| `dotenv` | ^16.0.3 | Environment variable loading |
| `uuid` | ^13.0.0 | UUID generation |
| `csv-parser` | ^3.2.0 | CSV parsing for bulk upload |
| `xlsx` | ^0.18.5 | Excel parsing for bulk upload |
| `express-validator` | ^7.3.1 | Alternative validation used on some routes |
| `winston` | latest | Logging |

### Dev Dependencies

| Package | Purpose |
|---|---|
| `nodemon` | Auto-restart on file changes |
| `eslint` | Linting |
| `eslint-config-prettier` | Disable ESLint rules conflicting with Prettier |
| `eslint-plugin-prettier` | Run Prettier as ESLint rule |
| `prettier` | Code formatter |

---

## 5. Environment Variables

### Required at Startup

`server.js` calls `process.exit(1)` immediately if any of these four are missing:

| Variable | Description |
|---|---|
| `DB_USER` | PostgreSQL username |
| `DB_PASSWORD` | PostgreSQL password |
| `DB_NAME` | PostgreSQL database name |
| `ACCESS_TOKEN_SECRET` | Secret for signing JWT access tokens |

### Full `.env.development` Reference

```env
# Server
PORT=5001
NODE_ENV=development

# Database
DB_USER=postgres
DB_PASSWORD=your_db_password
DB_NAME=bgv_platform
DB_HOST=localhost
DB_PORT=5432

# JWT
ACCESS_TOKEN_SECRET=your_access_secret_here
REFRESH_TOKEN_SECRET=your_refresh_secret_here

# Internal API key (required in x-api-key header on all /api/* requests)
BGV_API_KEY=bgv_secure_api_key_2026

# IDfy Eve v3
THIRD_PARTY_BASE_URL=https://eve.idfy.com
THIRD_PARTY_API_KEY=your-idfy-api-key        # → sent as header: api-key
THIRD_PARTY_API_SECRET=your-idfy-account-id  # → sent as header: account-id

# Rate Limiting (all optional — defaults shown below)
RATE_LIMIT_WINDOW_MS=900000          # 15 minutes (global limiter window)
RATE_LIMIT_MAX_REQUESTS=100          # max requests per window globally
API_RATE_LIMIT_WINDOW_MS=60000       # 1 minute (API-level limiter window)
API_RATE_LIMIT_MAX_REQUESTS=60       # 60 requests per minute on /api/*
```

> ⚠️ **Important:** `THIRD_PARTY_API_SECRET` is the IDfy **account-id**, NOT a password.
> IDfy authenticates via `api-key` + `account-id` request headers — not Bearer tokens.

### Environment File Loading Order

1. `server.js` runs `dotenv.config({ override: true })` → loads `.env`
2. `src/app.js` also loads `.env.${NODE_ENV}` (e.g., `.env.development`) → these values can override `.env`

> **Production Warning:** `src/utils/db.js` has a hardcoded fallback DB password (`mmcoe`) for local development. This must be removed before any production deployment.

---

## 6. Database Schema

All tables are created by running `src/migrations/001_init.sql` manually.

### `users`
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,          -- 'admin' or 'client'
    tenant_id UUID,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### `refresh_tokens`
```sql
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### `tenants`
```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    tier VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### `documents`
```sql
CREATE TABLE documents (
    id UUID PRIMARY KEY,
    original_name TEXT,
    file_name TEXT,
    file_path TEXT,
    file_size INT,
    mime_type TEXT,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### `verification_requests`

This is the core table. Every PAN/Aadhaar/GSTIN submission creates one row here.

```sql
CREATE TABLE verification_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_type VARCHAR(20),       -- 'PAN', 'AADHAAR', 'GSTIN'
    document_number VARCHAR(50),
    full_name VARCHAR(255),
    dob DATE,
    business_name VARCHAR(255),      -- GSTIN submissions only
    client_id UUID,                  -- links to tenants.id
    status VARCHAR(50),              -- 'verified' | 'failed' | 'retrying'
    retry_count INT DEFAULT 0,
    last_retry_at TIMESTAMP,
    api_status VARCHAR(20) DEFAULT 'pending',  -- 'pending' | 'processing' | 'success' | 'failed'
    failure_reason TEXT,             -- human-readable error from IDfy if api_status = 'failed'
    last_api_attempt TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### `verification_results`

One row per completed verification. Stores the full normalised IDfy response as JSONB.

```sql
CREATE TABLE verification_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verification_id UUID REFERENCES verification_requests(id),
    result_data JSONB,    -- full normalised IDfy response (see Section 12)
    verified BOOLEAN,     -- true if document exists in govt database
    processed_at TIMESTAMP DEFAULT NOW()
);
```

### `verification_retry_history`

Append-only audit trail of every retry event. Never updated, only inserted.

```sql
CREATE TABLE verification_retry_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verification_id UUID REFERENCES verification_requests(id),
    retry_number INT,
    retry_status VARCHAR(50),
    retry_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Understanding the Two Status Fields

This is a common source of confusion — there are two separate status fields on `verification_requests`:

| Field | What it tracks |
|---|---|
| `api_status` | Whether the IDfy HTTP call itself succeeded or failed |
| `status` | Whether the document was found in the government database |

Example: A valid PAN that isn't registered with NSDL will have `api_status = 'success'` (the API call worked) but `status = 'failed'` and `verified = false` (the document wasn't found).

---

## 7. Startup & Boot Sequence

`server.js` performs these steps in order — if step 4 fails, the process exits immediately:

1. Print current working directory
2. Load `.env` via `dotenv.config({ override: true })`
3. Print env diagnostics (DB_USER, DB_NAME, NODE_ENV, masked DB_PASSWORD)
4. **Assert required env vars** — `process.exit(1)` if any of the four required vars are missing
5. Load `src/app.js` (registers all middleware + routes)
6. Load logger
7. Start HTTP server on `PORT` (default: `5001`)

---

## 8. Security Middleware Stack

Middleware is applied in this exact order in `src/app.js`:

```
1.  helmet()              → Sets security HTTP headers (XSS, HSTS, etc.)
2.  cors()                → Allow cross-origin requests
3.  compression()         → Gzip all responses
4.  express.json()        → Parse JSON body (10mb limit)
5.  express.urlencoded()  → Parse URL-encoded body (10mb limit)
6.  requestLogger         → Per-request logging
7.  logger.middleware     → Winston HTTP logging (via morgan)
8.  globalLimiter         → 100 req / 15 min on ALL routes
9.  apiLimiter (/api/*)   → 60 req / 1 min on /api/* routes only
10. apiKeyAuth (/api/*)   → Rejects any /api/* request missing or sending wrong x-api-key
11. routes                → Application routes
12. notFound              → 404 handler (creates error and calls next)
13. errorHandler          → Global error handler (logs + returns standard error JSON)
```

### Routes That Bypass Authentication

These three routes require neither `x-api-key` nor JWT:

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Root welcome JSON |
| `GET` | `/health` | Server health check |
| `GET` | `/api/health` | API-level health check |

---

## 9. Authentication System

The system uses a two-token JWT setup — short-lived access tokens + long-lived refresh tokens.

### Token Summary

| Token | Expiry | Where stored | Env var for signing secret |
|---|---|---|---|
| Access Token | 15 minutes | Client memory / Authorization header | `ACCESS_TOKEN_SECRET` |
| Refresh Token | 7 days | `refresh_tokens` PostgreSQL table | `REFRESH_TOKEN_SECRET` |

### JWT Payloads

**Access Token:**
```json
{
  "id": "<user UUID>",
  "role": "admin | client",
  "tenant_id": "<tenant UUID>",
  "iat": 1712345678,
  "exp": 1712346578
}
```

**Refresh Token:**
```json
{
  "id": "<user UUID>",
  "iat": 1712345678,
  "exp": 1712950478
}
```

### How `authMiddleware` Works

1. Reads `Authorization: Bearer <token>` header
2. Splits on space, takes `[1]` (the token part)
3. Calls `jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)`
4. Attaches decoded `{ user_id, tenant_id, role }` to `req.user`
5. Returns `401` if header is missing
6. Returns `403` if token is invalid or expired

### How `roleMiddleware` Works

Used as a second middleware after `authMiddleware` on routes that need RBAC:

```js
// Only admins can create tenants
router.post('/tenants', authMiddleware, roleMiddleware(['admin']), tenantController.create);
```

Reads `req.user.role` and checks it against the provided `allowedRoles` array. Returns `403 Forbidden: insufficient permissions` if the role doesn't match.

### Which Routes Require Auth

Defined in `src/routes/index.js`:

| Path | API Key | JWT |
|---|---|---|
| `/api/auth/*` | ✅ Required | ❌ Not required |
| `/api/webhooks/*` | ✅ Required | ❌ Not required |
| `/api/health` | ✅ Required | ❌ Not required |
| Everything else | ✅ Required | ✅ Required |

### Password Hashing

Passwords are hashed with bcrypt and stored in `users.password_hash`. The raw password is never stored or logged. Login uses `bcrypt.compare(plainPassword, hash)`.

### Logout Behaviour

Logout deletes the refresh token row from `refresh_tokens`. This means:
- No new access tokens can be issued (refresh is invalidated server-side)
- The current access token may still be valid for up to 15 minutes (by design — no token blacklist)

---

## 10. API Routes Reference

### Required Headers

Every `/api/*` request needs:
```
x-api-key: bgv_secure_api_key_2026
```

Every `/api/*` request except `/api/auth/*` and `/api/webhooks/*` also needs:
```
Authorization: Bearer <access_token>
```

---

### Auth — `/api/auth`

| Method | Path | Request Body | Response |
|---|---|---|---|
| POST | `/api/auth/login` | `{ email, password }` | `{ accessToken, refreshToken }` |
| POST | `/api/auth/refresh` | `{ refreshToken }` | `{ accessToken }` |
| POST | `/api/auth/logout` | `{ refreshToken }` | `{ message }` |

---

### Verification — `/api/verifications`

> Both `/api/verification` (singular) and `/api/verifications` (plural) are registered and route to the same handlers.

| Method | Path | Description |
|---|---|---|
| POST | `/api/verifications/pan` | Submit PAN verification |
| POST | `/api/verifications/aadhaar` | Submit Aadhaar verification |
| POST | `/api/verifications/gstin` | Submit GSTIN verification |
| POST | `/api/verifications/retry/:id` | Manually retry a verification by UUID |
| GET | `/api/verifications/:id` | Fetch request + result by UUID |

#### POST `/api/verifications/pan`
```json
// Request body
{
  "pan_number": "ABCDE1234F",
  "full_name": "Rahul Sharma",
  "dob": "1998-05-10",
  "client_id": "550e8400-e29b-41d4-a716-446655440000"
}

// Response 201 — returned immediately before IDfy is called
{
  "success": true,
  "message": "PAN verification request created",
  "data": { /* full verification_requests row, api_status will be "pending" */ }
}
```

#### POST `/api/verifications/aadhaar`

Only the last 4 digits of Aadhaar are accepted. Full numbers are never stored (UIDAI compliant).

```json
{
  "masked_aadhaar": "XXXX-XXXX-1234",
  "full_name": "Rahul Sharma",
  "client_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### POST `/api/verifications/gstin`

`business_name` is stored for your records only — IDfy's GSTIN endpoint does not support server-side name matching (unlike PAN). To verify the name, compare it yourself against `legal_name` or `trade_name` in the IDfy result.

```json
{
  "gstin": "27ABCDE1234F1Z5",
  "business_name": "ABC Traders",
  "client_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### POST `/api/verifications/retry/:id`
```json
// Response 200
{
  "success": true,
  "message": "Retry triggered successfully",
  "data": { "retry_count": 1, "status": "retrying" }
}

// Response 404 if UUID not found
{ "success": false, "message": "Verification request not found" }
```

#### GET `/api/verifications/:id`
```json
// Response 200
{
  "success": true,
  "data": {
    "id": "uuid",
    "document_type": "PAN",
    "document_number": "ABCDE1234F",
    "full_name": "Rahul Sharma",
    "dob": "1998-05-10T00:00:00.000Z",
    "api_status": "success",
    "status": "verified",
    "failure_reason": null,
    "retry_count": 0,
    "verified": true,
    "result": { /* full normalised IDfy result_data from verification_results */ },
    "processed_at": "2026-03-30T14:45:08.016Z"
  }
}
```

---

### Upload — `/api/upload`

| Method | Path | Description |
|---|---|---|
| POST | `/api/upload` | Upload a single file (PDF/JPEG/PNG) |

```
Content-Type: multipart/form-data
Field name:   file
Allowed MIME: application/pdf, image/jpeg, image/png
```

```json
// Response 201
{
  "success": true,
  "message": "File uploaded successfully",
  "data": { "documentId": "uuid", "fileName": "demo.pdf" }
}
```

---

### Tenant Routes — `/api/tenants`

| Method | Path | Role Required | Description |
|---|---|---|---|
| GET | `/api/tenants` | `admin` or `client` | List tenants |
| POST | `/api/tenants` | `admin` only | Create a new tenant |

---

### Other Routes

| Prefix | Description |
|---|---|
| `/api/bulk-upload` | CSV/Excel batch verification submission |
| `/api/consent` | Consent record creation and verification |
| `/api/documents` | Document management (list, delete) |
| `/api/audit` | Audit log access |
| `/api/webhooks` | Inbound webhook events (public — no JWT required) |

---

### Standard Response Format

Every API response uses this envelope:

```json
// Success
{
  "success": true,
  "message": "Operation successful",
  "data": {}
}

// Error
{
  "success": false,
  "message": "Human-readable error description",
  "error": "ErrorType",
  "stack": "...stack trace — only included when NODE_ENV !== 'production'"
}
```

---

## 11. Verification Lifecycle

This diagram shows the complete flow from POST request to final DB state:

```
POST /api/verifications/pan
        ↓
Joi validation (PAN format regex, required fields)
  → 400 if invalid
        ↓
INSERT verification_requests
  document_type = 'PAN'
  api_status    = 'pending'
        ↓
HTTP 201 returned to client ← CLIENT GETS RESPONSE HERE
        ↓
Background async runner starts
        ↓
UPDATE api_status = 'processing'
        ↓
thirdPartyService.verifyPAN()
  → normaliseDob() converts JS Date to YYYY-MM-DD string
  → builds IDfy request body with task_id, group_id, data{}
  → POST to https://eve.idfy.com/v3/tasks/sync/verify_with_source/ind_pan
        ↓
  [On IDfy error]               [On IDfy success]
  UPDATE api_status = 'failed'   responseProcessor.process('idfy', response, 'pan')
  SET failure_reason = '...'        ↓
                                idfyMapping.transform() normalises fields
                                  ↓
                                INSERT verification_results
                                  result_data = normalised JSON
                                  verified    = true/false
                                  ↓
                                UPDATE verification_requests
                                  api_status = 'success'
                                  status     = 'verified' | 'failed'
```

### Status Value Reference

| Field | Value | Meaning |
|---|---|---|
| `api_status` | `pending` | Request created, IDfy call hasn't started yet |
| `api_status` | `processing` | IDfy call is currently in flight |
| `api_status` | `success` | IDfy responded (even if document wasn't found) |
| `api_status` | `failed` | IDfy call itself errored (network, auth, account plan, etc.) |
| `status` | `verified` | Document confirmed found in government database |
| `status` | `failed` | Document not found in government database |
| `status` | `retrying` | Manual retry was triggered |

---

## 12. IDfy Integration — Complete Technical Reference

IDfy Eve v3 is the third-party verification provider. Auth is via two request headers — `api-key` and `account-id` — not Bearer tokens.

### Authentication Headers (all IDfy calls)

```
api-key:      <THIRD_PARTY_API_KEY env var>
account-id:   <THIRD_PARTY_API_SECRET env var>
Content-Type: application/json
```

---

### PAN Verification (✅ Working Live)

**Endpoint:**
```
POST https://eve.idfy.com/v3/tasks/sync/verify_with_source/ind_pan
```

**Request body:**
```json
{
  "task_id":  "pan_1774794459989",
  "group_id": "bgv_1774794459989",
  "data": {
    "id_number": "ABCDE1234F",
    "full_name":  "Rahul Sharma",
    "dob":        "1998-05-10"
  }
}
```

> ⚠️ `dob` MUST be plain `YYYY-MM-DD` format. IDfy rejects ISO 8601 timestamps.
> PostgreSQL returns `dob` as a JS `Date` object. `normaliseDob()` in `thirdPartyService.js` handles this conversion automatically.

**Raw IDfy response shape:**
```json
{
  "status": "completed",
  "request_id": "uuid",
  "task_id": "pan_...",
  "group_id": "bgv_...",
  "result": {
    "source_output": {
      "status": "id_found",
      "pan_status": "Existing and Valid. PAN is Operative",
      "aadhaar_seeding_status": "Y",
      "name": "RAHUL SHARMA"
    },
    "name_match_result": {
      "match_result": "yes",
      "match_score": 100
    }
  }
}
```

**Key field paths in the raw response:**

| Data point | Path | Values |
|---|---|---|
| Task completed | `response.status` | `"completed"` / `"failed"` |
| PAN found in NSDL | `response.result.source_output.status` | `"id_found"` / `"id_not_found"` |
| PAN validity string | `response.result.source_output.pan_status` | Human-readable string |
| Aadhaar linked | `response.result.source_output.aadhaar_seeding_status` | `"Y"` / `"N"` |
| Name match | `response.result.name_match_result.match_result` | `"yes"` / `"no"` |
| Name match score | `response.result.name_match_result.match_score` | `0–100` |

**Normalised `result_data` stored in `verification_results.result_data`:**
```json
{
  "request_id": "uuid",
  "vendor": "idfy",
  "verification_type": "pan",
  "status": "success",
  "verified": true,
  "result": {
    "lookup_status": "id_found",
    "pan_status": "Existing and Valid. PAN is Operative",
    "aadhaar_seeding_status": "Y",
    "aadhaar_linked": true,
    "name_match_result": "yes",
    "name_match_score": 100,
    "name_matched": true
  },
  "raw_response": { /* full original IDfy response kept for audit */ },
  "processed_at": "2026-03-30T14:45:08.016Z"
}
```

---

### Aadhaar Verification (✅ Code Complete — ⏳ Account Activation Required)

**Endpoint:**
```
POST https://eve.idfy.com/v3/tasks/sync/verify_with_source/ind_aadhaar
```

**Request body:**
```json
{
  "task_id":  "aadhaar_<timestamp>",
  "group_id": "bgv_<timestamp>",
  "data": {
    "id_number": "1234",         // last 4 digits only — UIDAI compliant
    "full_name": "Rahul Sharma"
  }
}
```

The `normaliseAadhaar()` helper in `thirdPartyService.js` extracts the last 4 digits:
```javascript
// "XXXX-XXXX-1234" → "1234"
function normaliseAadhaar(maskedAadhaar) {
  const match = maskedAadhaar.match(/(\d{4})$/);
  return match[1];
}
```

**Expected response (once account is activated):**
```json
{
  "status": "completed",
  "result": {
    "source_output": {
      "status": "id_found",
      "name":          "RAHUL SHARMA",
      "year_of_birth": "1998",
      "gender":        "M",
      "area":          "Pune",
      "state":         "MH"
    },
    "name_match_result": { "match_result": "yes", "match_score": 95 }
  }
}
```

**Current behaviour:** IDfy returns `404 NOT_FOUND`. This is an account tier restriction, not a code bug. Individual Aadhaar verification requires UIDAI AUA/KUA licensing (enterprise plan only).

---

### GSTIN Verification (✅ Code Complete — ⏳ Account Activation Required)

**Endpoint:**
```
POST https://eve.idfy.com/v3/tasks/sync/verify_with_source/ind_gstin
```

**Request body:**
```json
{
  "task_id":  "gstin_<timestamp>",
  "group_id": "bgv_<timestamp>",
  "data": {
    "id_number": "27ABCDE1234F1Z5"
  }
}
```

> **Why `business_name` is not sent to IDfy:** IDfy's `ind_gstin` endpoint doesn't support server-side name matching (unlike PAN's `name_match_result`). `business_name` is stored in our DB for record-keeping only. To verify a business name, compare it against `legal_name` / `trade_name` in the IDfy response yourself.

**Expected response (once account is activated):**
```json
{
  "status": "completed",
  "result": {
    "source_output": {
      "status": "id_found",
      "gstin": "27ABCDE1234F1Z5",
      "legal_name": "ABC TRADERS PRIVATE LIMITED",
      "trade_name": "ABC TRADERS",
      "gstin_status": "Active",
      "registration_date": "2018-07-01",
      "last_updated": "2023-01-15",
      "business_type": "Regular",
      "principal_place_of_business": "Mumbai, Maharashtra",
      "state_jurisdiction": "Maharashtra",
      "center_jurisdiction": "Mumbai Central",
      "taxpayer_type": "Regular"
    }
  }
}
```

**Current behaviour:** IDfy returns `404 NOT_FOUND`. Same account tier restriction as Aadhaar (GST Portal access requires paid plan).

---

### Account Status Summary

| Endpoint | Status | Notes |
|---|---|---|
| PAN (`ind_pan`) | ✅ Working live | Fully tested |
| Aadhaar (`ind_aadhaar`) | ⏳ Blocked | 404 from IDfy — needs enterprise plan |
| GSTIN (`ind_gstin`) | ⏳ Blocked | 404 from IDfy — needs enterprise plan |

**To unblock Aadhaar and GSTIN:**
1. Email `eve.support@idfy.com`
2. Subject: `Enable ind_aadhaar and ind_gstin verify_with_source endpoints`
3. Include your `account-id` (the value of `THIRD_PARTY_API_SECRET` in `.env.development`)
4. OR request enterprise IDfy credentials from Shovel Screening Solutions

Server log evidence of the current blocker:
```
[IDfy REQUEST] POST https://eve.idfy.com/v3/tasks/sync/verify_with_source/ind_aadhaar
[IDfy ERROR] 404 { error: 'NOT_FOUND', message: 'Bad Request' }
```

---

### Key Service Files

| File | What it does |
|---|---|
| `src/utils/apiClient.js` | Axios instance — sets base URL, attaches `api-key` + `account-id` headers on every request, registers request/error interceptors |
| `src/services/thirdPartyService.js` | `verifyPAN()`, `verifyAadhaar()`, `verifyGSTIN()` — builds request bodies, calls IDfy via apiClient, runs `_assertResult()` to check response shape |
| `src/services/responseProcessor.js` | Calls `idfyMapping`, extracts fields using dot-notation paths, determines `verified` boolean, returns normalised object for DB storage |
| `src/services/vendorMappings/idfyMapping.js` | Dot-notation field paths for every IDfy response field, `successIndicator`, `transform()` function for cleanup (e.g., `"Y"/"N"` → boolean) |

### The `extractErrorMessage` Helper

In `verificationController.js`, this function extracts IDfy's real error from the Axios error instead of showing a generic message. This keeps `failure_reason` in the DB human-readable:

```javascript
function extractErrorMessage(err) {
  const data = err?.response?.data;
  if (data?.error && data?.message) return `${data.error}: ${data.message}`;
  return err.message || 'Unknown error';
}
```

### The `idfyMapping` Pattern

Each document type has a mapping object with:
- `fields` — dot-notation paths to extract from the IDfy response
- `required` — which fields must be present
- `successIndicator` — the path + value that means "document found"
- `transform()` — field cleanup (e.g., converts `aadhaar_seeding_status: "Y"` to `aadhaar_linked: true`)

`responseProcessor.process('idfy', rawResponse, 'pan'|'aadhaar'|'gstin')` handles all three types uniformly using this pattern.

---

## 13. Retry Mechanism

When `POST /api/verifications/retry/:id` is called:

1. Fetch the verification request — return `404` if not found
2. `UPDATE verification_requests SET retry_count = retry_count + 1, last_retry_at = NOW(), status = 'retrying'`
3. `INSERT INTO verification_retry_history` with `retry_reason = 'Manual retry triggered via API'`
4. Return the updated row

The `verification_retry_history` table is append-only — every retry event gets its own timestamped row, forming a full audit trail.

> ⚠️ **Current limitation:** Retry only updates `retry_count` and `status`. It does NOT re-call IDfy. Actual re-verification logic is planned for `src/jobs/vendorJob.js` (future work).

---

## 14. Multi-Tenant Support

Every verification request includes `client_id` (UUID) referencing `tenants.id`. One deployed instance serves multiple organizations with full data isolation.

### `tenantMiddleware`

After JWT validation, `tenantMiddleware.extractTenant` reads `tenant_id` from `req.user` (decoded from the access token) and attaches it to the request context for downstream controllers to use.

### `db.tenantQuery(text, params, tenantId)`

A wrapper around `db.query()` that automatically injects `WHERE tenant_id = $n` into `SELECT` queries that don't already filter by tenant. This prevents accidental cross-tenant data leakage even if a controller forgets to filter.

### `db.verifyTenantOwnership(table, id, tenantId)`

Before any update or delete, runs:
```sql
SELECT EXISTS(SELECT 1 FROM <table> WHERE id = $1 AND tenant_id = $2)
```

Returns `true` or `false`. Call this before modifying any resource to confirm it belongs to the requesting tenant.

---

## 15. File Upload

### Configuration (`src/config/multerConfig.js`)

| Setting | Value |
|---|---|
| Storage | Local disk, `uploads/<uuid>/` |
| Filename pattern | `<timestamp>-<random>-<originalname>` |
| Allowed MIME types | `application/pdf`, `image/jpeg`, `image/png` |
| Form field name | `file` |
| Size limit | Configured via Multer's `limits` option |

Each upload session gets a UUID-named subdirectory to prevent filename collisions:

```
uploads/
  <uuid>/
    <timestamp>-<rand>-<originalfilename>
```

> For production, replace local disk storage with an S3 engine in `multerConfig.js` (see Future Enhancements).

---

## 16. Bulk Upload

`POST /api/bulk-upload` accepts CSV or Excel files containing multiple verification records.

- **CSV parsing** via `csv-parser` library (`src/utils/csvParser.js`)
- **Excel parsing** via `xlsx` library (`src/utils/excelParser.js`)
- **Row-level validation** in `bulkUploadMiddleware.js` — each row is validated before inserting
- **Batch tracking** — a `BulkUploadBatch` record is created and updated as rows process
- **Error output** — rows that fail validation are written to a separate error CSV in the upload subdirectory
- **Service layer** — `src/services/bulkUploadService.js` orchestrates row-by-row processing

---

## 17. Error Handling

### Normal Error Flow

Controllers call `next(error)` for any unhandled error. The global handler in `src/middlewares/errorMiddleware.js`:

1. Reads `err.status || err.statusCode || 500`
2. Logs the error via Winston
3. Returns the standard error JSON response (see Section 10 for format)

### 404 Handler

Any request that reaches past all route definitions hits `errorMiddleware.notFound`, which creates an error with `status = 404` and message `Route Not Found - <originalUrl>` and passes it to the global handler.

### IDfy Error Extraction

`extractErrorMessage()` in `verificationController.js` pulls IDfy's actual `{ error, message }` body from the Axios error instead of returning a generic string. This ensures `failure_reason` in the DB is always human-readable.

### Stack Traces

Stack traces are included in error responses only when `NODE_ENV !== 'production'`. They are always `null` in production.

### Process-Level Guards (in `src/app.js`)

```javascript
process.on('uncaughtException', (err) => {
  logger.error(err);
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason) => {
  logger.error(reason);
  setTimeout(() => process.exit(1), 1000);
});
```

Both log the error and exit after 1 second, allowing the logger to flush.

---

## 18. Logging

Winston with two output transports:

| File | What's written |
|---|---|
| `logs/YYYY-MM-DD.log` | All log levels (daily rotating) |
| `logs/error.log` | Errors only (persistent) |

| Level | Used for |
|---|---|
| `info` | Server startup, DB connect, route activity |
| `warn` | Slow queries (>1000ms), 4xx responses |
| `error` | DB errors, uncaught exceptions, 5xx responses |
| `debug` | SQL query text (dev only), IDfy request/response bodies |

### Audit Logger (`src/utils/auditLogger.js`)

A separate structured logger for compliance audit trails. Each audit entry captures: user ID, tenant ID, action performed, resource accessed, IP address, and timestamp. Used by `auditMiddleware.js` and accessible via `/api/audit` routes.

---

## 19. Input Validation

All user-submitted data is validated by **Joi** schemas before reaching any controller. The `validate.js` middleware wraps schemas inline on route definitions:

```js
router.post('/pan', validate(panSchema), verificationController.createPanVerification);
```

Returns `400 Bad Request` with a structured message listing all failing fields.

### Validation Rules (`src/validator/verificationValidator.js`)

| Schema | Field | Rule |
|---|---|---|
| `panSchema` | `pan_number` | Must match `/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/` |
| `panSchema` | `full_name` | Required non-empty string |
| `panSchema` | `dob` | Required date |
| `panSchema` | `client_id` | Required UUID v4 |
| `aadhaarSchema` | `masked_aadhaar` | Must match `/^XXXX-XXXX-[0-9]{4}$/` |
| `aadhaarSchema` | `full_name` | Required non-empty string |
| `aadhaarSchema` | `client_id` | Required UUID v4 |
| `gstinSchema` | `gstin` | Must match `/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{3}$/` |
| `gstinSchema` | `business_name` | Required non-empty string |
| `gstinSchema` | `client_id` | Required UUID v4 |

---

## 20. Installation & Local Setup

### Prerequisites

- Node.js >= 18
- PostgreSQL >= 14
- npm >= 9

### Steps

```bash
# 1. Clone and install
git clone <repo-url>
cd bgv-backend
npm install

# 2. Configure environment
cp .env.development .env
# Edit .env — fill in:
#   DB_USER, DB_PASSWORD, DB_NAME
#   ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET
#   BGV_API_KEY
#   THIRD_PARTY_API_KEY, THIRD_PARTY_API_SECRET

# 3. Create the PostgreSQL database
psql -U postgres -c "CREATE DATABASE bgv_platform;"

# 4. Run the initial migration (creates all tables)
psql -U postgres -d bgv_platform -f src/migrations/001_init.sql

# 5. Create the uploads directory
mkdir -p uploads

# 6. Start in development mode
npm run dev
```

Server runs at: **http://localhost:5001**

---

## 21. Scripts

```bash
npm start          # node server.js (production)
npm run dev        # NODE_ENV=development nodemon server.js (auto-restart on changes)
npm run staging    # NODE_ENV=staging node server.js
npm run prod       # NODE_ENV=production node server.js
npm run lint       # eslint src/
npm run lint:fix   # eslint src/ --fix (auto-fix what it can)
npm run format     # prettier --write "src/**/*.js"
```

---

## 22. Testing

See **TESTING_GUIDE.md** for the complete PowerShell test suite.

### Quick Health Check

```bash
curl http://localhost:5001/health
```

### DB Query — Check Latest Verification Results

```sql
SELECT
  vr.id,
  vr.document_type,
  vr.document_number,
  vr.full_name,
  vr.api_status,
  vr.status,
  vr.failure_reason,
  res.verified,
  res.result_data,
  res.processed_at
FROM verification_requests vr
LEFT JOIN verification_results res ON res.verification_id = vr.id
ORDER BY vr.created_at DESC
LIMIT 10;
```

### cURL — Quick Endpoint Tests

Replace `<API_KEY>` and `<ACCESS_TOKEN>` with real values.

#### Login
```bash
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -H "x-api-key: bgv_secure_api_key_2026" \
  -d '{"email":"admin@test.com","password":"password123"}'
```

#### PAN Verification
```bash
curl -X POST http://localhost:5001/api/verifications/pan \
  -H "Content-Type: application/json" \
  -H "x-api-key: <API_KEY>" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -d '{
    "pan_number": "ABCDE1234F",
    "full_name": "Rahul Sharma",
    "dob": "1998-05-10",
    "client_id": "<tenant-uuid>"
  }'
```

#### Aadhaar Verification (will fail — account not enabled)
```bash
curl -X POST http://localhost:5001/api/verifications/aadhaar \
  -H "Content-Type: application/json" \
  -H "x-api-key: <API_KEY>" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -d '{
    "masked_aadhaar": "XXXX-XXXX-1234",
    "full_name": "Rahul Sharma",
    "client_id": "<tenant-uuid>"
  }'
```

#### GSTIN Verification (will fail — account not enabled)
```bash
curl -X POST http://localhost:5001/api/verifications/gstin \
  -H "Content-Type: application/json" \
  -H "x-api-key: <API_KEY>" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -d '{
    "gstin": "27ABCDE1234F1Z5",
    "business_name": "ABC Traders",
    "client_id": "<tenant-uuid>"
  }'
```

#### Retry a Verification
```bash
curl -X POST http://localhost:5001/api/verifications/retry/<verification-uuid> \
  -H "x-api-key: <API_KEY>" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

#### File Upload
```bash
curl -X POST http://localhost:5001/api/upload \
  -H "x-api-key: <API_KEY>" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -F "file=@/path/to/document.pdf"
```

#### Confirm API Key Protection (expect 401/403)
```bash
curl http://localhost:5001/api/upload
# → { "success": false, "message": "Unauthorized: Invalid API Key" }
```

### PowerShell — Full Flow Test

```powershell
$BASE_URL  = "http://localhost:5001"
$API_KEY   = "bgv_secure_api_key_2026"
$CLIENT_ID = "57cab5a9-3c1f-428e-9b80-34d3ca27ad3b"  # must exist in tenants table

$headers = @{ "x-api-key" = $API_KEY; "Content-Type" = "application/json" }

# 1. Login
$loginResponse = Invoke-RestMethod -Uri "$BASE_URL/api/auth/login" -Method POST -Headers $headers `
    -Body (@{ email = "admin@test.com"; password = "password123" } | ConvertTo-Json)
$ACCESS_TOKEN  = $loginResponse.accessToken
$REFRESH_TOKEN = $loginResponse.refreshToken

$authHeaders = @{
    "x-api-key"     = $API_KEY
    "Content-Type"  = "application/json"
    "Authorization" = "Bearer $ACCESS_TOKEN"
}

# 2. Submit PAN verification (fake — expect api_status = 'failed' after 6s)
$panResponse = Invoke-RestMethod -Uri "$BASE_URL/api/verifications/pan" -Method POST -Headers $authHeaders `
    -Body (@{ pan_number = "ABCDE1234F"; full_name = "Rahul Sharma"; dob = "1998-05-10"; client_id = $CLIENT_ID } | ConvertTo-Json)
$VERIFICATION_ID = $panResponse.data.id

Start-Sleep -Seconds 6

# 3. Fetch result
$result = Invoke-RestMethod -Uri "$BASE_URL/api/verifications/$VERIFICATION_ID" -Method GET -Headers $authHeaders
$result.data | Format-List

# 4. Retry
Invoke-RestMethod -Uri "$BASE_URL/api/verifications/retry/$VERIFICATION_ID" -Method POST -Headers $authHeaders

# 5. Logout
Invoke-RestMethod -Uri "$BASE_URL/api/auth/logout" -Method POST -Headers $authHeaders `
    -Body (@{ refreshToken = $REFRESH_TOKEN } | ConvertTo-Json)

# 6. Refresh after logout — should correctly fail
try {
    Invoke-RestMethod -Uri "$BASE_URL/api/auth/refresh" -Method POST -Headers $headers `
        -Body (@{ refreshToken = $REFRESH_TOKEN } | ConvertTo-Json)
    Write-Host "ERROR: Should have been rejected"
} catch {
    Write-Host "Correctly rejected after logout" -ForegroundColor Green
}
```

### PowerShell — Real PAN Verification (with formatted output)

```powershell
$BASE_URL  = "http://localhost:5001"
$API_KEY   = "bgv_secure_api_key_2026"
$CLIENT_ID = "57cab5a9-3c1f-428e-9b80-34d3ca27ad3b"

$headers   = @{ "x-api-key" = $API_KEY; "Content-Type" = "application/json" }
$loginResp = Invoke-RestMethod -Uri "$BASE_URL/api/auth/login" -Method POST -Headers $headers `
    -Body (@{ email = "admin@test.com"; password = "password123" } | ConvertTo-Json)
$authHeaders = @{
    "x-api-key"     = $API_KEY
    "Content-Type"  = "application/json"
    "Authorization" = "Bearer $($loginResp.accessToken)"
}

$panResp = Invoke-RestMethod -Uri "$BASE_URL/api/verifications/pan" -Method POST -Headers $authHeaders `
    -Body (@{
        pan_number = "YOUR_REAL_PAN_HERE"
        full_name  = "NAME EXACTLY AS ON PAN CARD"
        dob        = "YYYY-MM-DD"
        client_id  = $CLIENT_ID
    } | ConvertTo-Json)
$VID = $panResp.data.id

Write-Host "Created verification $VID — waiting 6s for IDfy..."
Start-Sleep -Seconds 6

$r = (Invoke-RestMethod -Uri "$BASE_URL/api/verifications/$VID" -Method GET -Headers $authHeaders).data

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
Write-Host "       PAN VERIFICATION RESULT           " -ForegroundColor Magenta
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
Write-Host "ID             : $($r.id)"
Write-Host "PAN            : $($r.document_number)"
Write-Host "Name           : $($r.full_name)"
Write-Host "DOB            : $(([DateTime]$r.dob).ToString('yyyy-MM-dd'))"
Write-Host "API Status     : $($r.api_status)"
Write-Host "Status         : $($r.status)"
Write-Host "Verified       : $($r.verified)"
Write-Host "PAN Status     : $($r.result.result.pan_status)"
Write-Host "Name Match     : $($r.result.result.name_match_result)"
Write-Host "Name Score     : $($r.result.result.name_match_score)"
Write-Host "Aadhaar Linked : $($r.result.result.aadhaar_seeding_status)"
Write-Host "Processed At   : $($r.processed_at)"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
```

---

## 23. Known Limitations & Blockers

### 🔴 Aadhaar & GSTIN — IDfy Account Plan Restriction (BE-3, BE-4)

Both `ind_aadhaar` and `ind_gstin` return `404 NOT_FOUND` from IDfy. **This is not a code bug.** The code is fully wired, tested at the code level, and production-ready — zero changes needed once the account is upgraded.

**Root cause:**
- Current IDfy account: test-tier (63 testing credits, 0 live credits)
- Individual Aadhaar requires UIDAI AUA/KUA licensing (IDfy enterprise plan only)
- GSTIN verification requires GST Portal access (not available on free tier)

**To fix:**
1. Email `eve.support@idfy.com`
2. Subject: `Enable ind_aadhaar and ind_gstin verify_with_source endpoints`
3. Include your `account-id` (value of `THIRD_PARTY_API_SECRET` in your `.env`)
4. OR request enterprise IDfy credentials from Shovel Screening Solutions
5. OR, as an alternative path for Aadhaar: the `ind_aadhaar_ocr` endpoint (image-upload flow) IS available on the current plan

See **BLOCKER_ANALYSIS_AND_FIX.md** for detailed resolution steps.

### 🟡 Retry Does Not Re-Call IDfy

`POST /retry/:id` updates `retry_count`, `status`, and `verification_retry_history`. It does **not** re-call IDfy. The re-verification logic is planned for `src/jobs/vendorJob.js`.

### 🟡 Hardcoded DB Password in `db.js`

`src/utils/db.js` has a hardcoded fallback DB password (`mmcoe`) for local development convenience. This **must** be removed and replaced with env vars before any production deployment.

---

## 24. Future Enhancements

| Enhancement | Where to implement |
|---|---|
| Enable Aadhaar + GSTIN verification | Upgrade IDfy account; zero code changes needed |
| Auto-retry workers | `src/jobs/vendorJob.js` stub |
| PDF report generation | `src/jobs/pdfJob.js` stub |
| Notification system | `src/jobs/notificationJob.js` stub |
| Cloud file storage (S3) | Replace local disk storage in `multerConfig.js` with S3 engine |
| Retry attempt limits | Add `max_retry_count` check in `retryVerification` controller |
| API versioning | Route structure already supports `/api/v1/...` — just rename prefixes |
| Gridlines as alternate vendor | `src/services/vendorMappings/gridlinesMapping.js` already scaffolded |
| Advanced role management | Extend `roleMiddleware` and add a `permissions` table |
| Verification analytics dashboard | `api_status`, `retry_count`, `last_api_attempt` fields pre-built for this |

---

## 25. Implemented Modules (Sprint Tracker)

| Module ID | Name | Status |
|---|---|---|
| BE-1 | Third-Party API Configuration Setup | ✅ Complete |
| BE-3 | Aadhaar Masked Verification Integration | ✅ **Code complete** / ⏳ Blocked on IDfy account |
| BE-4 | GSTIN Verification Integration | ✅ **Code complete** / ⏳ Blocked on IDfy account |
| BE-5 | File Upload Infrastructure & Authentication | ✅ Complete |
| BE-6 | Secure Backend Foundation (API Key, Rate Limiting, Helmet) | ✅ Complete |
| BE-7 | Verification Intake APIs (PAN, Aadhaar, GSTIN) | ✅ Complete |
| BE-8 | Verification Retry Mechanism | ✅ Complete |
| BE-9 | Verification API Status Tracking | ✅ Complete |
| BE-Phase5 | IDfy Eve v3 — PAN Verification | ✅ **Working live** |
| BE-Phase5 | IDfy Eve v3 — Aadhaar Verification | ✅ Code complete / ⏳ Blocked on IDfy account |
| BE-Phase5 | IDfy Eve v3 — GSTIN Verification | ✅ Code complete / ⏳ Blocked on IDfy account |
| BE-Phase6 | GET /verifications/:id endpoint | ✅ Complete |

---

## 26. Changelog

### v1.2.0 — March 30, 2026
- ✅ Completed BE-4: GSTIN verification integration
  - Added real `verifyGSTIN()` in `src/services/thirdPartyService.js` (replaced stub)
  - Expanded `src/services/vendorMappings/idfyMapping.js` with full 12-field GSTIN mapping
  - Added `gstin_active` boolean transform (mirrors `aadhaar_linked` pattern)
  - Code complete and tested at code level — blocked only on IDfy account activation
- Combined and improved README (merged v1.1.0 + v1.2.0 into single authoritative document)
- Added BLOCKER_ANALYSIS_AND_FIX.md reference
- Added TESTING_GUIDE.md reference

### v1.1.0 — March 29, 2026
- Completed Aadhaar integration at code level
- Documented IDfy account blockers
- Added full PowerShell test suite

### v1.0.0 — March 2026
- Initial release
- PAN verification working live with IDfy
- Multi-tenant architecture
- JWT authentication system
- File upload infrastructure