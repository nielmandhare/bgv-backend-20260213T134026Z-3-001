# BGV Backend — Background Verification Platform API

**Author:** Niel Mandhare (Backend Developer Intern)  
**Company:** Shovel Screening Solutions  
**Version:** 1.0.0  
**Runtime:** Node.js + Express.js  
**Database:** PostgreSQL  
**Entry point:** `server.js`

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
12. [Retry Mechanism](#12-retry-mechanism)
13. [Multi-Tenant Support](#13-multi-tenant-support)
14. [File Upload](#14-file-upload)
15. [Bulk Upload](#15-bulk-upload)
16. [Error Handling](#16-error-handling)
17. [Logging](#17-logging)
18. [Input Validation](#18-input-validation)
19. [Installation & Local Setup](#19-installation--local-setup)
20. [Scripts](#20-scripts)
21. [Testing Endpoints with cURL](#21-testing-endpoints-with-curl)
22. [Future Enhancements](#22-future-enhancements)
23. [Implemented Modules (Sprint Tracker)](#23-implemented-modules-sprint-tracker)

---

## 1. Project Purpose

This is the backend for a **Background Verification (BGV) Platform** that enables organizations to submit and track identity verification requests for PAN, Aadhaar, and GSTIN documents. The system is multi-tenant — multiple client organizations can share a single deployment while their data remains isolated.

> **Important:** A reusable third-party API integration module has been implemented using a centralized API client and service layer.
> Verification requests now trigger asynchronous external API calls, and the system updates `api_status` (`pending → processing → success/failed`) based on API responses.
> Currently, placeholder endpoints are used, and failures are captured with error messages for traceability.

---

## 2. Architecture Overview

```
Client Request
    ↓
server.js         ← loads .env, validates required vars, starts HTTP server
    ↓
src/app.js        ← applies all middleware in order, mounts routes
    ↓
Middleware Stack  ← Helmet → CORS → Compression → Body Parser → Logger
                    → Rate Limiter (global + API-level) → API Key Auth
    ↓
src/routes/       ← Route definitions (auth is public; all else requires JWT + tenant)
    ↓
src/middlewares/  ← authMiddleware (JWT verify) → tenantMiddleware (extract tenant)
    ↓
src/controllers/  ← Business logic + triggers async API calls
    ↓
src/services/     ← Third-party service layer (verification APIs)
    ↓
src/utils/apiClient.js ← Reusable Axios API client (base URL + headers + interceptors)
    ↓
External API (IDfy / Vendor)
    ↓
src/utils/db.js   ← PostgreSQL (status updates)
    ↓
PostgreSQL        ← bgv_platform database
```

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
│   │   ├── verificationController.js    ← PAN/Aadhaar/GSTIN intake + retry
│   │   ├── tenantController.js          ← tenant CRUD
│   │   ├── bulkUploadController.js      ← CSV/Excel batch upload
│   │   ├── consentController.js         ← consent record management
│   │   └── webhookController.js         ← inbound webhook handling
│   │
│   ├── routes/
│   │   ├── index.js             ← Master router; auth/webhooks are public, rest require JWT
│   │   ├── authRoutes.js        ← POST /login, /refresh, /logout
│   │   ├── verificationRoutes.js← POST /pan, /aadhaar, /gstin, /retry/:id
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
│   │   ├── BulkUploadBatch.js       ← Bulk batch model
│   │   ├── ConsentRecord.js         ← Consent record model
│   │   ├── VerificationRequest.js   ← Verification request model
│   │   ├── VerificationResult.js    ← Verification result model
│   │   ├── Report.js                ← Report model
│   │   └── RefreshToken.js          ← Refresh token model
│   │
│   ├── services/
│   │   ├── bulkUploadService.js          ← Bulk upload processing logic
│   │   ├── responseProcessor.js          ← Vendor API response normalization
│   │   └── vendorMappings/
│   │       ├── idfyMapping.js            ← IDfy response field mapping
│   │       ├── gridlinesMapping.js       ← Gridlines response field mapping
│   │       └── index.js                  ← Vendor mapper registry
│   │
│   ├── utils/
│   │   ├── db.js            ← PostgreSQL pool, query(), tenantQuery(), verifyTenantOwnership()
│   │   ├── apiResponse.js   ← Standardized { success, message, data } response builder
│   │   ├── logger.js        ← Winston logger with file + console transports
│   │   ├── auditLogger.js   ← Structured audit trail logging
│   │   ├── csvParser.js     ← CSV row parser utility
│   │   ├── excelParser.js   ← Excel/XLSX row parser utility
│   │   ├── consentValidator.js   ← Consent status verification
│   │   ├── confidenceCalculator.js ← Verification confidence scoring
│   │   ├── constants.js     ← Shared constants
│   │   └── logViewer.js     ← Log file reader utility
│   │
│   ├── migrations/
│   │   └── 001_init.sql     ← Initial DB schema (run manually)
│   │
│   ├── jobs/
│   │   ├── notificationJob.js   ← (stub) Future notification scheduling
│   │   ├── pdfJob.js            ← (stub) Future PDF report generation
│   │   └── vendorJob.js         ← (stub) Future vendor API polling
│   │
│   └── tests/
│       └── testTenantIsolation.js  ← Manual test for multi-tenant data isolation
│
├── uploads/               ← Temporary file storage (UUID-named subdirs)
├── logs/                  ← Daily rotating log files (YYYY-MM-DD.log + error.log)
├── .env                   ← Production secrets (never commit)
├── .env.development       ← Dev overrides
├── .env.staging           ← Staging overrides
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
| `pg` | ^8.11.0 | PostgreSQL client (uses connection pooling via `pg.Pool`) |
| `jsonwebtoken` | ^9.0.3 | JWT access + refresh token generation and verification |
| `bcrypt` | ^6.0.0 | Password hashing (bcrypt with default salt rounds) |
| `bcryptjs` | ^3.0.3 | Pure-JS fallback for bcrypt (used in some environments) |
| `joi` | ^18.0.2 | Schema-based input validation |
| `express-rate-limit` | ^8.3.1 | Request rate limiting (global + per-API) |
| `helmet` | ^8.1.0 | Security headers (XSS, CSP, HSTS, etc.) |
| `cors` | ^2.8.5 | Cross-Origin Resource Sharing |
| `compression` | ^1.8.1 | Gzip response compression |
| `morgan` | ^1.10.1 | HTTP request logging |
| `multer` | ^2.1.1 | Multipart file upload handling |
| `dotenv` | ^16.0.3 | Environment variable loading from `.env` files |
| `uuid` | ^13.0.0 | UUID generation for document IDs |
| `csv-parser` | ^3.2.0 | CSV file parsing for bulk upload |
| `xlsx` | ^0.18.5 | Excel file parsing for bulk upload |
| `express-validator` | ^7.3.1 | Alternative validation (used in some routes) |

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

### Required at Startup

`server.js` will call `process.exit(1)` if any of these are missing:

| Variable | Description |
|---|---|
| `DB_USER` | PostgreSQL username |
| `DB_PASSWORD` | PostgreSQL password |
| `DB_NAME` | PostgreSQL database name |
| `ACCESS_TOKEN_SECRET` | Secret for signing JWT access tokens |

### Full `.env` Reference

```env
# Server
PORT=5001
NODE_ENV=development          # development | staging | production

# Database
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=bgv_platform
DB_HOST=localhost
DB_PORT=5432

# JWT
ACCESS_TOKEN_SECRET=your_access_secret_here
REFRESH_TOKEN_SECRET=your_refresh_secret_here

# API Security
BGV_API_KEY=your_api_key_here

# Rate Limiting (optional — defaults shown)
RATE_LIMIT_WINDOW_MS=900000          # 15 minutes (global limiter)
RATE_LIMIT_MAX_REQUESTS=100          # max requests per window (global)
API_RATE_LIMIT_WINDOW_MS=60000       # 1 minute (API-level limiter)
API_RATE_LIMIT_MAX_REQUESTS=60       # 60 requests per minute (API-level)
```

### Environment File Loading Order

`server.js` calls `dotenv.config({ override: true })` which loads `.env`.
`src/app.js` additionally loads `.env.${NODE_ENV}` (e.g., `.env.development`), which can override values.

> **Note on DB Connection:** `src/utils/db.js` currently has hardcoded fallback values (`user: "postgres"`, `database: "bgv_platform"`, `password: "mmcoe"`). These are for local development only. In production, the `pg.Pool` constructor should read from `process.env` variables instead.

---

## 6. Database Schema

### `users`
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,          -- 'admin' or 'client'
    tenant_id UUID,                     -- links to tenants table
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
    document_type VARCHAR(20),          -- 'PAN', 'AADHAAR', 'GSTIN'
    document_number VARCHAR(50),
    full_name VARCHAR(255),
    dob DATE,
    business_name VARCHAR(255),         -- for GSTIN only
    client_id UUID,                     -- references tenants(id)
    status VARCHAR(50),

    -- Retry tracking fields (BE-8)
    retry_count INT DEFAULT 0,
    last_retry_at TIMESTAMP,

    -- API status tracking fields (BE-9)
    api_status VARCHAR(20) DEFAULT 'pending',  -- pending | processing | success | failed
    failure_reason TEXT,
    last_api_attempt TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
4. Assert all required env vars are present — **exits immediately if any are missing**
5. Load `src/app.js` (registers middleware + routes)
6. Load logger
7. Start HTTP server on `PORT` (default: `5001`)

---

## 8. Security Middleware Stack

Applied in `src/app.js` in this exact order:

```
1. helmet()                  → Security HTTP headers (XSS, CSP, HSTS, etc.)
2. cors()                    → Allow cross-origin requests
3. compression()             → Gzip all responses
4. express.json()            → Parse JSON body (10mb limit)
5. express.urlencoded()      → Parse URL-encoded form body (10mb limit)
6. requestLogger             → Per-request logging middleware
7. logger.middleware         → Winston HTTP logging
8. globalLimiter             → 100 req / 15 min on ALL routes
9. apiLimiter (/api/*)       → 60 req / 1 min on /api/* routes
10. apiKeyAuth (/api/*)      → Reject requests missing valid x-api-key header
11. routes                   → Application routes
12. errorMiddleware.notFound → 404 handler
13. errorMiddleware.errorHandler → Global error handler
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
5. Returns `401` if header is missing
6. Returns `403` if token is invalid or expired

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

### Logout Mechanism

Logout deletes the refresh token from the `refresh_tokens` table. This invalidates the session server-side — even if the access token hasn't expired yet, no new access token can be issued using the revoked refresh token.

---

## 10. API Routes Reference

### Request Headers Required

All `/api/*` routes require:
```
x-api-key: <BGV_API_KEY>
```

All routes except `/api/auth/*` and `/api/webhooks/*` additionally require:
```
Authorization: Bearer <access_token>
```

---

### Auth Routes — `/api/auth`

No JWT required for these routes.

#### POST `/api/auth/login`
```json
// Request body
{ "email": "user@example.com", "password": "password123" }

// Response 200
{ "accessToken": "...", "refreshToken": "..." }
```

#### POST `/api/auth/refresh`
```json
// Request body
{ "refreshToken": "..." }

// Response 200
{ "accessToken": "new_access_token" }
```

#### POST `/api/auth/logout`
```json
// Request body
{ "refreshToken": "..." }

// Response 200
{ "message": "Logged out successfully" }
```

---

### Verification Routes — `/api/verification` or `/api/verifications`

Both path prefixes (`/api/verification` and `/api/verifications`) are registered in `src/routes/index.js` and route to the same handlers.

#### POST `/api/verification/pan`

Validates PAN format before inserting. Sets `api_status = 'pending'` on creation.

```json
// Request body
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
  "data": { /* full row from verification_requests */ }
}
```

#### POST `/api/verification/aadhaar`

Only the last 4 digits of Aadhaar are accepted. Full Aadhaar numbers are never stored.

```json
// Request body
{
  "masked_aadhaar": "XXXX-XXXX-1234",
  "full_name": "Rahul Sharma",
  "client_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### POST `/api/verification/gstin`

```json
// Request body
{
  "gstin": "27ABCDE1234F1Z5",
  "business_name": "ABC Traders",
  "client_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### POST `/api/verification/retry/:id`

Triggers a manual retry for any verification request by its UUID. Requires admin role.

```json
// Response 200
{
  "success": true,
  "message": "Retry triggered successfully",
  "data": {
    "retry_count": 1,
    "status": "retrying",
    /* ...other updated fields */
  }
}

// Response 404 if ID not found
{ "success": false, "message": "Verification request not found" }
```

---

### Upload Route — `/api/upload`

#### POST `/api/upload`

```
Content-Type: multipart/form-data
Field name: file
Allowed MIME types: application/pdf, image/jpeg, image/png
```

```json
// Response 201
{
  "success": true,
  "message": "File uploaded successfully",
  "data": {
    "documentId": "uuid",
    "fileName": "demo.pdf"
  }
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
| `/api/webhooks` | Inbound webhook events (public — no auth) |

---

### Standard API Response Format

All endpoints return this shape:

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

## 11. Verification Lifecycle (Updated with API Integration)

Every verification request follows this state machine:

```
Client submits POST /pan, /aadhaar, or /gstin
        ↓
Joi schema validation
        ↓
INSERT into verification_requests
        ↓
Initial state:
  api_status = 'pending'
        ↓
Controller triggers async API call (non-blocking)
        ↓
External API request (via service + apiClient)
       ↙                    ↘
  Success                Failure
     ↓                      ↓
api_status = 'processing'  api_status = 'failed'
last_api_attempt updated   failure_reason stored
```

### Key Design Decisions

- **Non-blocking API calls**: API requests are triggered asynchronously to avoid blocking client responses.
- **Service layer abstraction**: All third-party API calls are handled via `thirdPartyService.js`.
- **Reusable API client**: Axios instance (`apiClient.js`) manages base URL, headers, and interceptors.
- **Error traceability**: All API failures are logged and stored in `failure_reason` for debugging.

---

## 12. Retry Mechanism

When `POST /api/verification/retry/:id` is called:

1. Fetch the verification request — return `404` if not found
2. `UPDATE verification_requests SET retry_count = retry_count + 1, last_retry_at = NOW(), status = 'retrying'`
3. `INSERT INTO verification_retry_history (verification_id, retry_number, retry_status, retry_reason)` with `retry_reason = 'Manual retry triggered via API'`
4. Return the updated row

The `verification_retry_history` table provides a complete, immutable audit trail of every retry event. Each row is append-only and timestamped.

---

## 13. Multi-Tenant Support

Every verification request includes `client_id` (UUID) referencing the `tenants` table. This enables one deployed instance to serve multiple client organizations with full data isolation.

### `tenantMiddleware`

After JWT validation, `tenantMiddleware.extractTenant` reads `tenant_id` from `req.user` (which was decoded from the access token) and attaches it to the request context for downstream use.

### `db.tenantQuery(text, params, tenantId)`

A wrapper around `db.query()` that automatically injects `WHERE tenant_id = $n` into `SELECT` queries that do not already contain `tenant_id`. This prevents accidental cross-tenant data leakage even if a controller forgets to filter.

### `db.verifyTenantOwnership(table, id, tenantId)`

Runs `SELECT EXISTS(SELECT 1 FROM <table> WHERE id = $1 AND tenant_id = $2)` before any update or delete operation to confirm the resource belongs to the requesting tenant. Returns `true` or `false`.

---

## 14. File Upload

### Configuration (`src/config/multerConfig.js`)

- **Storage:** Local disk inside `uploads/<subdirectory>/`
- **Filename pattern:** `<timestamp>-<random>-<originalname>`
- **Allowed MIME types:** `application/pdf`, `image/jpeg`, `image/png`
- **File size limit:** Configured via Multer's `limits` option

### Upload Directory Structure

```
uploads/
  <uuid>/
    <timestamp>-<rand>-<originalfilename>
```

Each upload session gets its own UUID-named subdirectory.

---

## 15. Bulk Upload

The `/api/bulk-upload` endpoint accepts CSV or Excel files containing multiple verification records in one request.

- **CSV parsing:** `csv-parser` library via `src/utils/csvParser.js`
- **Excel parsing:** `xlsx` library via `src/utils/excelParser.js`
- **Row validation:** `bulkUploadMiddleware.js` validates each row before inserting
- **Batch tracking:** A `BulkUploadBatch` record is created and updated as rows are processed
- **Error output:** Rows that fail validation are written to a separate error CSV file in the upload subdirectory
- **Service layer:** `src/services/bulkUploadService.js` orchestrates row-by-row processing

---

## 16. Error Handling

### Error Flow

Controllers call `next(error)` for any unhandled error. The global handler in `src/middlewares/errorMiddleware.js`:
1. Reads `err.status || err.statusCode || 500`
2. Logs the error via Winston
3. Returns the standard error JSON response

### 404 Handler

Any request reaching past all route definitions hits `errorMiddleware.notFound`, which creates an error with `status = 404` and message `Route Not Found - <originalUrl>`.

### Stack Traces

Included in responses only when `process.env.NODE_ENV !== 'production'`. Always `null` in production.

### Process-Level Guards

`src/app.js` registers:
- `process.on('uncaughtException', ...)` — logs the error and calls `process.exit(1)` after 1 second
- `process.on('unhandledRejection', ...)` — same behavior

---

## 17. Logging

### Logger (`src/utils/logger.js`)

Uses **Winston** with:
- **Console transport** — colored, timestamped output for development
- **File transport** — daily rotating log files:
  - `logs/YYYY-MM-DD.log` — all log levels
  - `logs/error.log` — error level only

### Log Levels

| Level | Used For |
|---|---|
| `info` | Server startup, DB connect, route activity |
| `warn` | Slow queries (>1000ms) |
| `error` | DB errors, uncaught exceptions, 4xx/5xx errors |
| `debug` | SQL query text (development only, first 200 chars) |

### Audit Logger (`src/utils/auditLogger.js`)

Separate structured logger for compliance audit trails. Captures: user ID, tenant ID, action performed, resource accessed, IP address, and timestamp. Used by `auditMiddleware.js`.

---

## 18. Input Validation

All user-submitted data is validated using **Joi** schemas before reaching controllers.

### Verification Validation Schemas (`src/validator/verificationValidator.js`)

| Schema | Field | Validation Rule |
|---|---|---|
| `panSchema` | `pan_number` | Regex `/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/` — 10 chars: 5 uppercase letters, 4 digits, 1 uppercase letter |
| `panSchema` | `full_name` | Required non-empty string |
| `panSchema` | `dob` | Required date |
| `panSchema` | `client_id` | Required UUID v4 |
| `aadhaarSchema` | `masked_aadhaar` | Regex `/^XXXX-XXXX-[0-9]{4}$/` — only last 4 digits accepted |
| `aadhaarSchema` | `full_name` | Required non-empty string |
| `aadhaarSchema` | `client_id` | Required UUID v4 |
| `gstinSchema` | `gstin` | Regex `/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{3}$/` — 15 chars |
| `gstinSchema` | `business_name` | Required non-empty string |
| `gstinSchema` | `client_id` | Required UUID v4 |

### Validation Middleware (`src/middlewares/validate.js`)

Reusable wrapper used in route definitions:
```js
router.post('/pan', validate(panSchema), verificationController.createPanVerification);
```

Returns `400 Bad Request` with a structured error message listing all failing fields if validation does not pass.

---

## 19. Installation & Local Setup

### Prerequisites

- Node.js >= 18
- PostgreSQL >= 14
- npm >= 9

### Steps

```bash
# 1. Clone the repository
git clone <repo-url>
cd bgv-backend

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.development .env
# Edit .env — set DB_USER, DB_PASSWORD, DB_NAME, ACCESS_TOKEN_SECRET,
# REFRESH_TOKEN_SECRET, BGV_API_KEY

# 4. Create the PostgreSQL database
psql -U postgres -c "CREATE DATABASE bgv_platform;"

# 5. Run the initial migration
psql -U postgres -d bgv_platform -f src/migrations/001_init.sql

# 6. Create the uploads directory
mkdir -p uploads

# 7. Start in development mode (nodemon auto-restart)
npm run dev

# OR start without auto-restart
npm start
```

Server runs at: **http://localhost:5001**

---

## 20. Scripts

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

## 21. Testing Endpoints with cURL

Replace `<API_KEY>` and `<ACCESS_TOKEN>` with actual values.

### Health Check (no auth required)
```bash
curl http://localhost:5001/health
```

### Login
```bash
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -H "x-api-key: <API_KEY>" \
  -d '{"email":"admin@test.com","password":"password123"}'
```

### PAN Verification
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

### Aadhaar Verification
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

### Retry Verification
```bash
curl -X POST http://localhost:5001/api/verification/retry/<verification-uuid> \
  -H "x-api-key: <API_KEY>" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

### File Upload
```bash
curl -X POST http://localhost:5001/api/upload \
  -H "x-api-key: <API_KEY>" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -F "file=@/path/to/document.pdf"
```

### Test API Key Protection (expect 403)
```bash
curl http://localhost:5001/api/upload
# → { "success": false, "message": "Unauthorized: Invalid API Key" }
```

### Refresh Token
```bash
curl -X POST http://localhost:5001/api/auth/refresh \
  -H "Content-Type: application/json" \
  -H "x-api-key: <API_KEY>" \
  -d '{"refreshToken":"<refresh_token>"}'
```

---

## 22. Future Enhancements

The codebase is structured to support these additions with minimal changes:

| Enhancement | Hook Point |
|---|---|
| **IDfy integration** | `src/services/vendorMappings/idfyMapping.js` is already scaffolded; Phase 5 wires real API calls here |
| **Gridlines integration** | `src/services/vendorMappings/gridlinesMapping.js` already scaffolded as alternate provider |
| **Auto retry workers** | `src/jobs/vendorJob.js` stub is the insertion point for cron-based retry scheduling |
| **PDF report generation** | `src/jobs/pdfJob.js` stub |
| **Notification system** | `src/jobs/notificationJob.js` stub |
| **Cloud storage (S3)** | Replace local `uploads/` logic in `multerConfig.js` with S3 storage engine |
| **Retry attempt limits** | Add `max_retry_count` business rule in `retryVerification` controller |
| **Verification analytics** | `api_status`, `retry_count`, `last_api_attempt` fields are pre-built for dashboard queries |
| **API versioning** | Route structure supports `/api/v1/...` with minimal changes to `src/routes/index.js` |
| **Advanced role management** | Extend `roleMiddleware` and add a `permissions` table |

---

## 23. Implemented Modules (Sprint Tracker)

| Module ID | Name | Status |
|---|---|---|
| BE-1 | Third-Party API Configuration Setup | ✅ Complete |
| BE-5 | File Upload Infrastructure & Authentication | ✅ Complete |
| BE-6 | Secure Backend Foundation (API Key, Rate Limiting, Helmet) | ✅ Complete |
| BE-7 | Verification Intake APIs (PAN, Aadhaar, GSTIN) | ✅ Complete |
| BE-8 | Verification Retry Mechanism | ✅ Complete |
| BE-9 | Verification API Status Tracking | ✅ Complete |
| BE-Phase5 | External Verification Integration (IDfy) | 🟡 In Progress (API client + service layer ready) |