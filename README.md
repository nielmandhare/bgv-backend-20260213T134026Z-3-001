# BGV Backend — Background Verification Platform API

**Authors:** Atharva Jadhav & Niel Mandhare  
**Company:** Shovel Screening Solutions  
**Version:** 1.1.0  
**Runtime:** Node.js + Express.js  
**Database:** PostgreSQL  
**Entry point:** `server.js`  
**Third-party API:** IDfy Eve v3 REST API (`https://eve.idfy.com`)  
**Last Updated:** March 2026

---

## Table of Contents

1. [Project Purpose](#1-project-purpose)
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

---

## 1. Project Purpose

This is the backend for a **Background Verification (BGV) Platform** that enables organizations to submit and track identity verification requests for PAN, Aadhaar, and GSTIN documents. The system is multi-tenant — multiple client organizations can share a single deployment while their data remains isolated.

The IDfy Eve v3 REST API is fully integrated and working for PAN verification. Aadhaar and GSTIN are fully wired in code but blocked on IDfy account activation (see Section 23).

Verification requests are fire-and-forget async — the HTTP response is returned immediately, the IDfy call happens in the background, and the DB is updated with the result via `api_status`: `pending → processing → success/failed`. All API failures are captured in `failure_reason` for full traceability.

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
src/controllers/
verificationController.js
    ↓
  INSERT into verification_requests (api_status = 'pending')
    ↓
  Fire-and-forget async runner
    ↓
src/services/thirdPartyService.js   ← builds request body, calls IDfy
    ↓
src/utils/apiClient.js              ← Axios instance with IDfy auth headers
    ↓
IDfy Eve v3 REST API (https://eve.idfy.com)
    ↓
src/services/responseProcessor.js  ← normalises raw IDfy response
    ↓
src/services/vendorMappings/
idfyMapping.js                      ← field path definitions for IDfy v3 shape
    ↓
INSERT into verification_results
UPDATE verification_requests (api_status = 'success' | 'failed')
    ↓
PostgreSQL — bgv_platform database
```

**Key design decisions:**
- **Non-blocking API calls** — verification responses return HTTP 201 instantly; IDfy runs in the background.
- **Service layer abstraction** — all third-party calls go through `thirdPartyService.js`.
- **Reusable API client** — `apiClient.js` manages base URL, headers, and interceptors centrally.
- **Error traceability** — all IDfy failures are logged and stored in `failure_reason` for debugging.

---

## 3. Project Structure

```
bgv-backend/
│
├── server.js                    ← HTTP server bootstrap (loads env, validates, starts)
│
├── src/
│   ├── app.js                   ← Express app: middleware chain + route mounting
│   │
│   ├── config/
│   │   └── multerConfig.js      ← Multer file upload config (type + size validation)
│   │
│   ├── controllers/
│   │   ├── authController.js            ← login, refreshToken, logout
│   │   ├── uploadController.js          ← single file upload handler
│   │   ├── verificationController.js    ← PAN/Aadhaar/GSTIN intake, retry, getById
│   │   ├── tenantController.js          ← tenant CRUD
│   │   ├── bulkUploadController.js      ← CSV/Excel batch upload
│   │   ├── consentController.js         ← consent record management
│   │   └── webhookController.js         ← inbound webhook handling
│   │
│   ├── routes/
│   │   ├── index.js             ← Master router
│   │   ├── authRoutes.js        ← POST /login, /refresh, /logout
│   │   ├── verificationRoutes.js← POST /pan, /aadhaar, /gstin, /retry/:id, GET /:id
│   │   ├── uploadRoutes.js      ← POST /upload
│   │   ├── tenantRoutes.js      ← GET/POST /tenants
│   │   ├── bulkUploadRoutes.js  ← POST /bulk-upload
│   │   ├── consentRoutes.js     ← Consent management
│   │   ├── documentRoutes.js    ← Document management
│   │   ├── auditRoutes.js       ← Audit log access
│   │   └── webhookRoutes.js     ← POST /webhooks
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
│   ├── models/
│   │   ├── User.js                  ← findByEmail(), findById()
│   │   ├── BaseModel.js             ← Shared model helpers
│   │   ├── Document.js              ← Document model
│   │   ├── Tenant.js                ← Tenant model
│   │   ├── AuditLog.js              ← Audit log model
│   │   ├── BulkUploadBatch.js       ← Bulk batch tracking model
│   │   ├── ConsentRecord.js         ← Consent record model
│   │   ├── VerificationRequest.js   ← Verification request model
│   │   ├── VerificationResult.js    ← Verification result model
│   │   ├── Report.js                ← Report model
│   │   └── RefreshToken.js          ← Refresh token model
│   │
│   ├── services/
│   │   ├── thirdPartyService.js          ← IDfy API calls (PAN/Aadhaar/GSTIN)
│   │   ├── bulkUploadService.js          ← Bulk upload processing logic
│   │   ├── responseProcessor.js          ← Normalises raw IDfy response for DB storage
│   │   └── vendorMappings/
│   │       ├── idfyMapping.js            ← IDfy v3 field path mappings + transform
│   │       ├── gridlinesMapping.js       ← Gridlines response field mapping (stub)
│   │       └── index.js                  ← Vendor mapper registry
│   │
│   ├── utils/
│   │   ├── db.js                   ← PostgreSQL pool, query(), tenantQuery(), verifyTenantOwnership()
│   │   ├── apiClient.js            ← Axios instance with IDfy auth headers + interceptors
│   │   ├── apiResponse.js          ← Standardized { success, message, data } response builder
│   │   ├── logger.js               ← Winston logger with file + console transports
│   │   ├── auditLogger.js          ← Structured audit trail logging
│   │   ├── csvParser.js            ← CSV row parser utility
│   │   ├── excelParser.js          ← Excel/XLSX row parser utility
│   │   ├── consentValidator.js     ← Consent status verification
│   │   ├── confidenceCalculator.js ← Verification confidence scoring
│   │   ├── constants.js            ← Shared constants
│   │   └── logViewer.js            ← Log file reader utility
│   │
│   ├── migrations/
│   │   └── 001_init.sql     ← Initial DB schema (run manually)
│   │
│   ├── jobs/
│   │   ├── notificationJob.js   ← (stub) Future notification scheduling
│   │   ├── pdfJob.js            ← (stub) Future PDF report generation
│   │   └── vendorJob.js         ← (stub) Future vendor API polling / auto-retry
│   │
│   └── tests/
│       └── testTenantIsolation.js  ← Manual test for multi-tenant data isolation
│
├── uploads/               ← Temporary file storage (UUID-named subdirs)
├── logs/                  ← Daily rotating log files (YYYY-MM-DD.log + error.log)
├── .env.development       ← Dev secrets (never commit)
├── .eslintrc.js           ← ESLint config
├── .prettierrc            ← Prettier config
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
| `bcrypt` | ^6.0.0 | Password hashing |
| `bcryptjs` | ^3.0.3 | Pure-JS fallback for bcrypt |
| `joi` | ^18.0.2 | Schema-based input validation |
| `express-rate-limit` | ^8.3.1 | Request rate limiting |
| `helmet` | ^8.1.0 | Security headers |
| `cors` | ^2.8.5 | Cross-Origin Resource Sharing |
| `compression` | ^1.8.1 | Gzip response compression |
| `morgan` | ^1.10.1 | HTTP request logging |
| `multer` | ^2.1.1 | Multipart file upload handling |
| `dotenv` | ^16.0.3 | Environment variable loading |
| `uuid` | ^13.0.0 | UUID generation |
| `csv-parser` | ^3.2.0 | CSV file parsing for bulk upload |
| `xlsx` | ^0.18.5 | Excel file parsing for bulk upload |
| `express-validator` | ^7.3.1 | Alternative validation (some routes) |
| `winston` | latest | Logging |

### Dev Dependencies

| Package | Purpose |
|---|---|
| `nodemon` | Auto-restart server on file changes during development |
| `eslint` | JavaScript linting |
| `eslint-config-prettier` | Disable ESLint rules that conflict with Prettier |
| `eslint-plugin-prettier` | Run Prettier as an ESLint rule |
| `prettier` | Code formatter |

---

## 5. Environment Variables

### Required at Startup (server.js exits if missing)

`server.js` will call `process.exit(1)` if any of these are missing:

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

# Internal API key (x-api-key header)
BGV_API_KEY=bgv_secure_api_key_2026

# IDfy Eve v3
THIRD_PARTY_BASE_URL=https://eve.idfy.com
THIRD_PARTY_API_KEY=your-idfy-api-key        # → header: api-key
THIRD_PARTY_API_SECRET=your-idfy-account-id  # → header: account-id

# Rate Limiting (optional — defaults shown)
RATE_LIMIT_WINDOW_MS=900000          # 15 minutes (global limiter)
RATE_LIMIT_MAX_REQUESTS=100          # max requests per window (global)
API_RATE_LIMIT_WINDOW_MS=60000       # 1 minute (API-level limiter)
API_RATE_LIMIT_MAX_REQUESTS=60       # 60 requests per minute (API-level)
```

> ⚠️ `THIRD_PARTY_API_SECRET` is the IDfy **account-id**, not a password.
> IDfy uses `api-key` + `account-id` headers for auth — not Bearer tokens.

### Environment File Loading Order

`server.js` calls `dotenv.config({ override: true })` which loads `.env`.
`src/app.js` additionally loads `.env.${NODE_ENV}` (e.g., `.env.development`), which can override values.

> **Note on DB Connection:** `src/utils/db.js` currently has hardcoded fallback values for local development (`mmcoe`). These must be replaced with env vars before any production deployment.

---

## 6. Database Schema

### `users`
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
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
```sql
CREATE TABLE verification_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_type VARCHAR(20),       -- 'PAN', 'AADHAAR', 'GSTIN'
    document_number VARCHAR(50),
    full_name VARCHAR(255),
    dob DATE,
    business_name VARCHAR(255),      -- GSTIN only
    client_id UUID,
    status VARCHAR(50),              -- 'verified' | 'failed' | 'retrying'
    retry_count INT DEFAULT 0,
    last_retry_at TIMESTAMP,
    api_status VARCHAR(20) DEFAULT 'pending',
    failure_reason TEXT,
    last_api_attempt TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### `verification_results`
```sql
CREATE TABLE verification_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verification_id UUID REFERENCES verification_requests(id),
    result_data JSONB,    -- full normalised IDfy response stored here
    verified BOOLEAN,
    processed_at TIMESTAMP DEFAULT NOW()
);
```

### `verification_retry_history`
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

---

## 7. Startup & Boot Sequence

`server.js` performs startup in this exact order:

1. Print working directory
2. Load `.env` with `dotenv.config({ override: true })`
3. Print env diagnostics (`DB_USER`, `DB_NAME`, `NODE_ENV`, masked `DB_PASSWORD`)
4. Assert required env vars — **exits immediately if any are missing**
5. Load `src/app.js` (registers middleware + routes)
6. Load logger
7. Start HTTP server on `PORT` (default: `5001`)

---

## 8. Security Middleware Stack

```
1.  helmet()              → Security HTTP headers
2.  cors()                → Allow cross-origin requests
3.  compression()         → Gzip all responses
4.  express.json()        → Parse JSON body (10mb limit)
5.  express.urlencoded()  → Parse URL-encoded body (10mb limit)
6.  requestLogger         → Per-request logging
7.  logger.middleware     → Winston HTTP logging
8.  globalLimiter         → 100 req / 15 min on ALL routes
9.  apiLimiter (/api/*)   → 60 req / 1 min on /api/* routes
10. apiKeyAuth (/api/*)   → Reject missing/invalid x-api-key
11. routes                → Application routes
12. notFound              → 404 handler
13. errorHandler          → Global error handler
```

### Public Routes (No API Key / No JWT Required)

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Root welcome JSON |
| `GET` | `/health` | Server health check |
| `GET` | `/api/health` | API-level health check (inside router, before auth) |

---

## 9. Authentication System

### Token Types

| Token | Expiry | Storage | Secret Env Var |
|---|---|---|---|
| Access Token | 15 minutes | Client memory / Authorization header | `ACCESS_TOKEN_SECRET` |
| Refresh Token | 7 days | `refresh_tokens` PostgreSQL table | `REFRESH_TOKEN_SECRET` |

### Access Token JWT Payload
```json
{
  "id": "<user UUID>",
  "role": "admin | client",
  "tenant_id": "<tenant UUID>",
  "iat": 1712345678,
  "exp": 1712346578
}
```

### Refresh Token JWT Payload
```json
{
  "id": "<user UUID>",
  "iat": 1712345678,
  "exp": 1712950478
}
```

### How `authMiddleware` Works

1. Reads `Authorization: Bearer <token>` header
2. Splits on space and takes index `[1]`
3. Calls `jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)`
4. Attaches `{ user_id, tenant_id, role }` to `req.user`
5. Returns `401` if header is missing, `403` if token is invalid/expired

### How `roleMiddleware` Works

```js
// Usage in a route file:
router.post('/tenants', authMiddleware, roleMiddleware(['admin']), tenantController.create);
```

Reads `req.user.role` and checks it against the `allowedRoles` array. Returns `403 Forbidden: insufficient permissions` if the role is not in the list.

### Route-Level Auth Breakdown

In `src/routes/index.js`:
- `/api/auth/*` — **Public** (no JWT)
- `/api/webhooks/*` — **Public** (no JWT)
- `/api/health` — **Public** (no JWT)
- Everything else — `authMiddleware` + `tenantMiddleware` applied at router level

### Password Hashing

Passwords are stored as bcrypt hashes in `users.password_hash`. Login calls `bcrypt.compare(plainPassword, hash)`. The raw password is never stored or logged.

### Logout

Deletes the refresh token from the `refresh_tokens` table. New access tokens cannot be issued once the refresh token is revoked. This invalidates the session server-side — even if the access token hasn't expired yet.

---

## 10. API Routes Reference

### Required Headers

All `/api/*` routes:
```
x-api-key: bgv_secure_api_key_2026
```

All routes except `/api/auth/*` and `/api/webhooks/*`:
```
Authorization: Bearer <access_token>
```

---

### Auth — `/api/auth`

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/auth/login` | `{ email, password }` | `{ accessToken, refreshToken }` |
| POST | `/api/auth/refresh` | `{ refreshToken }` | `{ accessToken }` |
| POST | `/api/auth/logout` | `{ refreshToken }` | `{ message }` |

---

### Verification — `/api/verifications` (also `/api/verification`)

Both path prefixes (`/api/verification` and `/api/verifications`) are registered in `src/routes/index.js` and route to the same handlers.

| Method | Path | Description |
|---|---|---|
| POST | `/api/verifications/pan` | Submit PAN verification request |
| POST | `/api/verifications/aadhaar` | Submit Aadhaar verification request |
| POST | `/api/verifications/gstin` | Submit GSTIN verification request |
| POST | `/api/verifications/retry/:id` | Manually retry a verification by UUID |
| GET | `/api/verifications/:id` | Fetch verification request + result by UUID |

#### POST `/api/verifications/pan`
```json
// Request
{
  "pan_number": "ABCDE1234F",
  "full_name": "Rahul Sharma",
  "dob": "1998-05-10",
  "client_id": "550e8400-e29b-41d4-a716-446655440000"
}

// Response 201
{
  "success": true,
  "message": "PAN verification request created",
  "data": { /* verification_requests row, api_status: "pending" */ }
}
```

#### POST `/api/verifications/aadhaar`

Only the last 4 digits of Aadhaar are accepted. Full Aadhaar numbers are never stored (UIDAI compliant).

```json
{
  "masked_aadhaar": "XXXX-XXXX-1234",
  "full_name": "Rahul Sharma",
  "client_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### POST `/api/verifications/gstin`
```json
{
  "gstin": "27ABCDE1234F1Z5",
  "business_name": "ABC Traders",
  "client_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### POST `/api/verifications/retry/:id`

Triggers a manual retry for any verification request by its UUID.

```json
// Response 200
{
  "success": true,
  "message": "Retry triggered successfully",
  "data": { "retry_count": 1, "status": "retrying" }
}

// Response 404 if ID not found
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
    "dob": "1998-05-10T...",
    "api_status": "success",
    "status": "verified",
    "failure_reason": null,
    "retry_count": 0,
    "verified": true,
    "result": { /* full normalised IDfy result_data from verification_results */ },
    "processed_at": "2026-03-29T14:45:08.016Z"
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
| `GET` | `/api/tenants` | `admin` or `client` | List tenants |
| `POST` | `/api/tenants` | `admin` | Create a new tenant |

---

### Other Routes

| Prefix | Description |
|---|---|
| `/api/bulk-upload` | CSV/Excel batch verification submission |
| `/api/consent` | Consent record creation and verification |
| `/api/documents` | Document management (list, delete) |
| `/api/audit` | Audit log access |
| `/api/webhooks` | Inbound webhook events (public — no JWT) |

---

### Standard API Response Format

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
  "message": "Error description",
  "error": "ErrorType",
  "stack": "...stack trace in development only"
}
```

---

## 11. Verification Lifecycle

```
POST /api/verifications/pan
        ↓
Joi validation (PAN format, required fields)
        ↓
INSERT verification_requests (api_status = 'pending')
        ↓
HTTP 201 returned to client immediately
        ↓
Background async runner starts
        ↓
UPDATE api_status = 'processing'
        ↓
thirdPartyService.verifyPAN() → IDfy Eve v3 API
        ↓
responseProcessor.process() → idfyMapping normalisation
        ↓
INSERT verification_results (result_data, verified)
        ↓
UPDATE verification_requests
  api_status = 'success' | 'failed'
  status     = 'verified' | 'failed'
```

### DB Status Values

| Field | Value | Meaning |
|---|---|---|
| `api_status` | `pending` | Request created, API call not yet started |
| `api_status` | `processing` | IDfy call in progress |
| `api_status` | `success` | IDfy responded correctly (even if doc not found in govt DB) |
| `api_status` | `failed` | IDfy errored or network failure |
| `status` | `verified` | Document confirmed found in govt DB |
| `status` | `failed` | Document not found in govt DB |
| `status` | `retrying` | Manual retry triggered |

> **Important distinction:** `api_status=success` means the API call itself succeeded.
> `status=verified` means the document exists in the government database.
> A real PAN that doesn't exist in NSDL will have `api_status=success` but `status=failed` and `verified=false`.

---

## 12. IDfy Integration — Complete Technical Reference

### PAN Endpoint (✅ Working)

```
POST https://eve.idfy.com/v3/tasks/sync/verify_with_source/ind_pan
```

**Auth Headers:**
```
api-key:      <THIRD_PARTY_API_KEY>
account-id:   <THIRD_PARTY_API_SECRET>
Content-Type: application/json
```

**Request Body:**
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

> ⚠️ `dob` MUST be plain `YYYY-MM-DD`. IDfy rejects ISO 8601 timestamps.
> PostgreSQL returns `dob` as a JS `Date` object — `normaliseDob()` in `thirdPartyService.js` handles this conversion automatically.

**IDfy Response Shape:**
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
    "name_match_result": { "match_result": "yes", "match_score": 100 }
  }
}
```

**Key Response Paths:**

| Field | Path in response | Meaning |
|---|---|---|
| Task status | `response.status` | `completed` or `failed` |
| PAN lookup result | `response.result.source_output.status` | `id_found` or `id_not_found` |
| PAN validity | `response.result.source_output.pan_status` | Human-readable PAN status string |
| Aadhaar linked | `response.result.source_output.aadhaar_seeding_status` | `"Y"` / `"N"` |
| Name match | `response.result.name_match_result.match_result` | `"yes"` / `"no"` |
| Name match score | `response.result.name_match_result.match_score` | `0–100` |

**Normalised `result_data` stored in DB:**
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
  "raw_response": { /* full IDfy response kept for audit */ },
  "processed_at": "2026-03-29T14:45:08.016Z"
}
```

---

### Aadhaar Endpoint (⏳ Account Activation Required)

```
POST https://eve.idfy.com/v3/tasks/sync/verify_with_source/ind_aadhaar
```

**Request Body:**
```json
{
  "task_id":  "aadhaar_<timestamp>",
  "group_id": "bgv_<timestamp>",
  "data": {
    "id_number": "1234",         ← last 4 digits only (UIDAI compliant)
    "full_name": "Rahul Sharma"
  }
}
```

**Expected Response (when account is activated):**
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

**Current behaviour:** IDfy returns `404 NOT_FOUND` — endpoint not enabled on this account tier.

---

### GSTIN Endpoint (⏳ Account Activation Required)

```
POST https://eve.idfy.com/v3/tasks/sync/verify_with_source/ind_gstin
```

**Current behaviour:** `verifyGSTIN()` throws immediately — same account plan blocker as Aadhaar. Code structure is fully wired and mirrors the PAN/Aadhaar pattern.

---

### Key Files

| File | Responsibility |
|---|---|
| `src/utils/apiClient.js` | Axios instance: base URL, `api-key` + `account-id` headers, request/error interceptors |
| `src/services/thirdPartyService.js` | Builds request body, calls IDfy, runs `_assertResult`, returns raw response |
| `src/services/responseProcessor.js` | Calls `idfyMapping`, extracts fields, determines `verified`, maps `status` |
| `src/services/vendorMappings/idfyMapping.js` | Dot-notation field paths, `successIndicator`, `transform()` for cleanup |

### Important Code Patterns

#### `extractErrorMessage` (in `verificationController.js`)

Pulls IDfy's real error from the axios error body instead of a generic message:

```javascript
function extractErrorMessage(err) {
  const data = err?.response?.data;
  if (data?.error && data?.message) return `${data.error}: ${data.message}`;
  return err.message || 'Unknown error';
}
```

#### `normaliseAadhaar` (in `thirdPartyService.js`)

Extracts last 4 digits for IDfy, discarding the masked portion:

```javascript
function normaliseAadhaar(maskedAadhaar) {
  const match = maskedAadhaar.match(/(\d{4})$/);
  return match[1]; // "XXXX-XXXX-1234" → "1234"
}
```

#### `idfyMapping` Pattern

Each document type has: `fields` (dot-notation paths), `required`, `successIndicator`, and `transform()`.
`responseProcessor.process('idfy', rawResponse, 'pan'|'aadhaar'|'gstin')` handles all types uniformly.

### Account Status

| Endpoint | Status |
|---|---|
| PAN (`ind_pan`) | ✅ Working |
| Aadhaar (`ind_aadhaar`) | ❌ 404 — not on account plan |
| GSTIN (`ind_gstin`) | ❌ Not wired — same blocker |

To enable Aadhaar/GSTIN, contact: `eve.support@idfy.com` with your `account-id`.

---

## 13. Retry Mechanism

When `POST /api/verifications/retry/:id` is called:

1. Fetch the verification request — return `404` if not found
2. `UPDATE verification_requests SET retry_count = retry_count + 1, last_retry_at = NOW(), status = 'retrying'`
3. `INSERT INTO verification_retry_history` with `retry_reason = 'Manual retry triggered via API'`
4. Return the updated row

The `verification_retry_history` table provides a complete, immutable audit trail of every retry event. Each row is append-only and timestamped.

> ⚠️ **Retry does not re-trigger the IDfy API call.** It only updates `retry_count` and `status`. Actual re-verification logic belongs in `src/jobs/vendorJob.js` (future work).

---

## 14. Multi-Tenant Support

Every verification request includes `client_id` (UUID) referencing the `tenants` table. This enables one deployed instance to serve multiple client organizations with full data isolation.

### `tenantMiddleware`

After JWT validation, `tenantMiddleware.extractTenant` reads `tenant_id` from `req.user` (decoded from the access token) and attaches it to the request context for downstream use.

### `db.tenantQuery(text, params, tenantId)`

A wrapper around `db.query()` that automatically injects `WHERE tenant_id = $n` into `SELECT` queries that do not already contain `tenant_id`. This prevents accidental cross-tenant data leakage even if a controller forgets to filter.

### `db.verifyTenantOwnership(table, id, tenantId)`

Runs `SELECT EXISTS(SELECT 1 FROM <table> WHERE id = $1 AND tenant_id = $2)` before any update or delete operation to confirm the resource belongs to the requesting tenant. Returns `true` or `false`.

---

## 15. File Upload

### Configuration (`src/config/multerConfig.js`)

- **Storage:** Local disk inside `uploads/<uuid>/`
- **Filename pattern:** `<timestamp>-<random>-<originalname>`
- **Allowed types:** `application/pdf`, `image/jpeg`, `image/png`
- **Field name:** `file`
- **File size limit:** Configured via Multer's `limits` option

### Upload Directory Structure

```
uploads/
  <uuid>/
    <timestamp>-<rand>-<originalfilename>
```

Each upload session gets its own UUID-named subdirectory to avoid filename collisions.

---

## 16. Bulk Upload

`POST /api/bulk-upload` accepts CSV or Excel files containing multiple verification records.

- **CSV parsing:** `csv-parser` library via `src/utils/csvParser.js`
- **Excel parsing:** `xlsx` library via `src/utils/excelParser.js`
- **Row-level validation:** `bulkUploadMiddleware.js` validates each row before inserting
- **Batch tracking:** A `BulkUploadBatch` record is created and updated as rows are processed
- **Error output:** Rows that fail validation are written to a separate error CSV in the upload subdirectory
- **Service layer:** `src/services/bulkUploadService.js` orchestrates row-by-row processing

---

## 17. Error Handling

### Error Flow

Controllers call `next(error)` for any unhandled error. The global handler in `src/middlewares/errorMiddleware.js`:

1. Reads `err.status || err.statusCode || 500`
2. Logs the error via Winston
3. Returns the standard error JSON response

### 404 Handler

Any request reaching past all route definitions hits `errorMiddleware.notFound`, which creates an error with `status = 404` and message `Route Not Found - <originalUrl>`.

### IDfy Error Extraction

IDfy axios errors are handled by `extractErrorMessage()` in `verificationController.js`, which pulls the real `{ error, message }` body from IDfy's response rather than returning a generic axios error string. This ensures `failure_reason` in the DB is always human-readable.

### Stack Traces

Included in responses only when `process.env.NODE_ENV !== 'production'`. Always `null` in production.

### Process-Level Guards

`src/app.js` registers:
- `process.on('uncaughtException', ...)` — logs the error and calls `process.exit(1)` after 1 second
- `process.on('unhandledRejection', ...)` — same behavior

---

## 18. Logging

**Winston** with console + daily rotating file transports:

- `logs/YYYY-MM-DD.log` — all levels
- `logs/error.log` — errors only

| Level | Used For |
|---|---|
| `info` | Server startup, DB connect, route activity |
| `warn` | Slow queries (>1000ms), 4xx responses |
| `error` | DB errors, uncaught exceptions, 5xx |
| `debug` | SQL query text (dev only), IDfy request/response bodies |

### Audit Logger (`src/utils/auditLogger.js`)

Separate structured logger for compliance audit trails. Captures: user ID, tenant ID, action performed, resource accessed, IP address, and timestamp. Used by `auditMiddleware.js` and consumed via `/api/audit` routes.

---

## 19. Input Validation

All user-submitted data is validated using **Joi** schemas before reaching controllers. The reusable `validate.js` middleware wraps schemas inline on route definitions:

```js
router.post('/pan', validate(panSchema), verificationController.createPanVerification);
```

Returns `400 Bad Request` with a structured error message listing all failing fields if validation does not pass.

**Schemas in `src/validator/verificationValidator.js`:**

| Schema | Field | Rule |
|---|---|---|
| `panSchema` | `pan_number` | `/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/` |
| `panSchema` | `full_name` | Required non-empty string |
| `panSchema` | `dob` | Required date |
| `panSchema` | `client_id` | Required UUID v4 |
| `aadhaarSchema` | `masked_aadhaar` | `/^XXXX-XXXX-[0-9]{4}$/` |
| `aadhaarSchema` | `full_name` | Required non-empty string |
| `aadhaarSchema` | `client_id` | Required UUID v4 |
| `gstinSchema` | `gstin` | `/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{3}$/` |
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
# Edit .env — set DB_USER, DB_PASSWORD, DB_NAME, ACCESS_TOKEN_SECRET,
# REFRESH_TOKEN_SECRET, BGV_API_KEY, THIRD_PARTY_API_KEY, THIRD_PARTY_API_SECRET

# 3. Create the PostgreSQL database
psql -U postgres -c "CREATE DATABASE bgv_platform;"

# 4. Run the initial migration
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
npm start          # node server.js
npm run dev        # NODE_ENV=development nodemon server.js
npm run staging    # NODE_ENV=staging node server.js
npm run prod       # NODE_ENV=production node server.js
npm run lint       # eslint src/
npm run lint:fix   # eslint src/ --fix
npm run format     # prettier --write "src/**/*.js"
```

---

## 22. Testing

### Quick Health Check

```bash
curl http://localhost:5001/health
```

### DB Query to Verify Result

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

---

### cURL — Quick Endpoint Tests

Replace `<API_KEY>` and `<ACCESS_TOKEN>` with actual values.

#### Login
```bash
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -H "x-api-key: <API_KEY>" \
  -d '{"email":"admin@test.com","password":"password123"}'
```

#### PAN Verification
```bash
curl -X POST http://localhost:5001/api/verification/pan \
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

#### Aadhaar Verification
```bash
curl -X POST http://localhost:5001/api/verification/aadhaar \
  -H "Content-Type: application/json" \
  -H "x-api-key: <API_KEY>" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -d '{
    "masked_aadhaar": "XXXX-XXXX-1234",
    "full_name": "Rahul Sharma",
    "client_id": "<tenant-uuid>"
  }'
```

#### Retry Verification
```bash
curl -X POST http://localhost:5001/api/verification/retry/<verification-uuid> \
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

#### Test API Key Protection (expect 403)
```bash
curl http://localhost:5001/api/upload
# → { "success": false, "message": "Unauthorized: Invalid API Key" }
```

#### Refresh Token
```bash
curl -X POST http://localhost:5001/api/auth/refresh \
  -H "Content-Type: application/json" \
  -H "x-api-key: <API_KEY>" \
  -d '{"refreshToken":"<refresh_token>"}'
```

---

### PowerShell — Full API Test Suite

See `TEST_SUITE.ps1` for the full suite. The abbreviated version below covers all major flows.

```powershell
$BASE_URL  = "http://localhost:5001"
$API_KEY   = "bgv_secure_api_key_2026"
$CLIENT_ID = "57cab5a9-3c1f-428e-9b80-34d3ca27ad3b"

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

# 2. PAN (fake — expect api_status=failed)
$panResponse = Invoke-RestMethod -Uri "$BASE_URL/api/verifications/pan" -Method POST -Headers $authHeaders `
    -Body (@{ pan_number = "ABCDE1234F"; full_name = "Rahul Sharma"; dob = "1998-05-10"; client_id = $CLIENT_ID } | ConvertTo-Json)
$VERIFICATION_ID = $panResponse.data.id

Start-Sleep -Seconds 6

# 3. Fetch result
$result = Invoke-RestMethod -Uri "$BASE_URL/api/verifications/$VERIFICATION_ID" -Method GET -Headers $authHeaders
$result.data | Format-List

# 4. Aadhaar (will fail — not enabled on account)
Invoke-RestMethod -Uri "$BASE_URL/api/verifications/aadhaar" -Method POST -Headers $authHeaders `
    -Body (@{ masked_aadhaar = "XXXX-XXXX-1234"; full_name = "Rahul Sharma"; client_id = $CLIENT_ID } | ConvertTo-Json)

# 5. GSTIN (will fail — not enabled on account)
Invoke-RestMethod -Uri "$BASE_URL/api/verifications/gstin" -Method POST -Headers $authHeaders `
    -Body (@{ gstin = "27ABCDE1234F1Z5"; business_name = "ABC Traders"; client_id = $CLIENT_ID } | ConvertTo-Json)

# 6. Retry
Invoke-RestMethod -Uri "$BASE_URL/api/verifications/retry/$VERIFICATION_ID" -Method POST -Headers $authHeaders

# 7. Logout
Invoke-RestMethod -Uri "$BASE_URL/api/auth/logout" -Method POST -Headers $authHeaders `
    -Body (@{ refreshToken = $REFRESH_TOKEN } | ConvertTo-Json)

# 8. Refresh after logout (should fail)
try {
    Invoke-RestMethod -Uri "$BASE_URL/api/auth/refresh" -Method POST -Headers $headers `
        -Body (@{ refreshToken = $REFRESH_TOKEN } | ConvertTo-Json)
    Write-Host "ERROR: Should have failed"
} catch { Write-Host "Correctly rejected" -ForegroundColor Green }
```

---

### PowerShell — Real PAN Verification Test

```powershell
$BASE_URL  = "http://localhost:5001"
$API_KEY   = "bgv_secure_api_key_2026"
$CLIENT_ID = "57cab5a9-3c1f-428e-9b80-34d3ca27ad3b"

$headers     = @{ "x-api-key" = $API_KEY; "Content-Type" = "application/json" }
$loginResp   = Invoke-RestMethod -Uri "$BASE_URL/api/auth/login" -Method POST -Headers $headers `
    -Body (@{ email = "admin@test.com"; password = "password123" } | ConvertTo-Json)
$authHeaders = @{
    "x-api-key"     = $API_KEY
    "Content-Type"  = "application/json"
    "Authorization" = "Bearer $($loginResp.accessToken)"
}

$panResp = Invoke-RestMethod -Uri "$BASE_URL/api/verifications/pan" -Method POST -Headers $authHeaders `
    -Body (@{
        pan_number = "YOUR_PAN_HERE"
        full_name  = "NAME AS ON PAN"
        dob        = "YYYY-MM-DD"
        client_id  = $CLIENT_ID
    } | ConvertTo-Json)
$VID = $panResp.data.id

Write-Host "Created: $VID — waiting 6s..."
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
Write-Host "DOB Match      : $($r.result.result.dob_match)"
Write-Host "Aadhaar Linked : $($r.result.result.aadhaar_seeding_status)"
Write-Host "Processed At   : $($r.processed_at)"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
```

---

## 23. Known Limitations & Blockers

### 🔴 BE-3 — Aadhaar `ind_aadhaar` not on account plan

The `ind_aadhaar` endpoint returns `404 NOT_FOUND` from IDfy. This is an **account plan restriction, not a code issue**. Individual Aadhaar verification requires UIDAI AUA/KUA licensing, which IDfy only enables on paid enterprise accounts.

The current account (test-tier, 63 testing credits, Live Credits: 0) does not include this endpoint. The code is fully wired and ready — zero changes needed once activated.

**Evidence from server log:**
```
[IDfy REQUEST] POST https://eve.idfy.com/v3/tasks/sync/verify_with_source/ind_aadhaar
[IDfy ERROR] 404 { error: 'NOT_FOUND', message: 'Bad Request' }
```

**To fix:**
1. Email `eve.support@idfy.com`, subject: `Enable ind_aadhaar verify_with_source endpoint`, body: include your `account-id`
2. OR ask Shovel Screening Solutions for enterprise IDfy credentials
3. OR implement Aadhaar OCR as an alternative (`ind_aadhaar_ocr` — image upload flow, available on current plan)

### 🟡 GSTIN — Same Account Blocker

`verifyGSTIN()` throws immediately. Not yet wired to the IDfy endpoint. Same account plan restriction applies. The code structure mirrors the PAN/Aadhaar pattern and is ready to wire once the account is activated.

### 🟡 Retry Does Not Re-Trigger IDfy

`POST /retry/:id` only updates `retry_count` and `status`. Actual re-verification logic belongs in `src/jobs/vendorJob.js` (future work).

### 🟡 Hardcoded Fallback in `db.js`

`src/utils/db.js` has a hardcoded fallback password for local development. This must be replaced with env vars before any production deployment.

---

## 24. Future Enhancements

| Enhancement | Hook Point |
|---|---|
| Enable Aadhaar + GSTIN | Activate on IDfy account; code is already wired |
| Auto retry workers | `src/jobs/vendorJob.js` stub |
| PDF report generation | `src/jobs/pdfJob.js` stub |
| Notification system | `src/jobs/notificationJob.js` stub |
| Cloud storage (S3) | Replace `multerConfig.js` local storage with S3 engine |
| Retry attempt limits | Add `max_retry_count` rule in `retryVerification` controller |
| API versioning | Route structure supports `/api/v1/...` |
| Gridlines as alternate vendor | `src/services/vendorMappings/gridlinesMapping.js` already scaffolded |
| Advanced role management | Extend `roleMiddleware` and add a `permissions` table |
| Verification analytics | `api_status`, `retry_count`, `last_api_attempt` fields are pre-built for dashboard queries |

---

## 25. Implemented Modules (Sprint Tracker)

| Module ID | Name | Status |
|---|---|---|
| BE-1 | Third-Party API Configuration Setup | ✅ Complete |
| BE-3 | Aadhaar Masked Verification Integration | ✅ Code complete / ⏳ Account blocked |
| BE-5 | File Upload Infrastructure & Authentication | ✅ Complete |
| BE-6 | Secure Backend Foundation (API Key, Rate Limiting, Helmet) | ✅ Complete |
| BE-7 | Verification Intake APIs (PAN, Aadhaar, GSTIN) | ✅ Complete |
| BE-8 | Verification Retry Mechanism | ✅ Complete |
| BE-9 | Verification API Status Tracking | ✅ Complete |
| BE-Phase5 | IDfy Eve v3 Integration — PAN Verification | ✅ Complete |
| BE-Phase5 | IDfy Eve v3 Integration — Aadhaar | ✅ Code complete / ⏳ Account blocked |
| BE-Phase5 | IDfy Eve v3 Integration — GSTIN | ⏳ Pending account activation |
| BE-Phase6 | GET /verifications/:id endpoint | ✅ Complete |