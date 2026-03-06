## Backend Modules Implemented

- **BE-5** – File Upload Infrastructure & Authentication
- **BE-6** – Secure Backend Foundation
- **BE-7** – Verification Intake APIs
- **BE-8** – Verification Retry Mechanism
- **BE-9** – Verification API Status Tracking
---

# 📌 Overview

This module implements a secure and modular backend for the Background Verification (BGV) platform. It provides APIs for file uploads, authentication, authorization, and secure data access.

The system includes:

* Secure file upload infrastructure
* JWT-based authentication and session management
* Role-based access control (Admin / Client)
* Protected APIs using middleware
* PostgreSQL data persistence
* Centralized error handling and validation

⚠️ Note: IDfy integration is not included yet. The architecture is designed to support future third-party verification integration.

---

# 🚀 Features

## File Upload Module

* Single file upload API
* File type validation (PDF, JPG, PNG)
* File size validation
* Temporary file storage using UUID naming
* PostgreSQL metadata persistence
* Structured API response with document ID

## Authentication & Security Module

* User Login API with password hashing
* JWT Access Token generation
* Refresh Token mechanism with DB storage
* Logout API with token revocation
* Role-based access control (Admin / Client)
* Secure protected APIs using middleware
* Authorization header validation
* Token verification middleware
* Role middleware for permission control

## Backend Architecture Enhancements

* Standardized API response format
* Centralized error handling middleware
* Request validation using Joi
* API versioning support
* Modular scalable architecture

---
---

# 🔐 Secure Backend Foundation (BE-6)

This enhancement introduces core backend security mechanisms to ensure safe configuration management, controlled API access, and protection against abuse. It also prepares the application for production deployment with HTTPS-ready configuration.

The system includes:

* Secure environment variable management
* API key-based access protection
* Global rate limiting
* HTTPS-ready server configuration
* Security headers integration
* Production deployment readiness

---

## Security Features

### Environment Variable Security

Sensitive configuration values such as database credentials, JWT secrets, and API keys are stored securely using environment variables via dotenv.

Benefits:

* Prevents exposure of secrets in source code
* Supports environment-based configuration
* Improves deployment flexibility

---

### API Key Protection Middleware

All `/api` routes are protected using a custom API key authentication middleware.

Request Header:

x-api-key: <API_KEY>


Unauthorized requests return a **403 Forbidden** response.

---

### Global Rate Limiting

Implemented using **express-rate-limit** to prevent abuse and excessive requests.

Configuration is environment-driven:

RATE_LIMIT_WINDOW_MS
RATE_LIMIT_MAX_REQUESTS


Protects against:

* Brute-force attempts
* API abuse
* Denial-of-service attacks

---

### HTTPS-Ready Configuration

The backend is prepared for secure deployment using:

* Helmet security headers
* Proxy trust configuration for production environments

Example:

app.use(helmet());

if (process.env.NODE_ENV === 'production') {
app.set('trust proxy', 1);
}

This ensures compatibility with:

* Reverse proxies
* Load balancers
* Cloud hosting platforms

---

## Security Middleware Flow

Helmet → CORS → Compression
→ Body Parsing
→ Logging
→ Rate Limiting
→ API Key Authentication
→ Routes
→ Error Handling

This layered architecture provides defense-in-depth security.

---


This layered architecture provides defense-in-depth security.

---

## Security Testing

### Unauthorized Access

curl http://localhost:5001/api/upload


Response:
Unauthorized: Invalid API Key


### Authorized Access
curl -H "x-api-key: <API_KEY>" http://localhost:5001/api/upload


### Rate Limit Trigger

Multiple rapid requests result in:



Too many requests, please try again later.


---
---

# 📑 Verification Intake APIs (BE-7)

This module introduces intake APIs for collecting verification requests for **PAN, Aadhaar (masked), and GSTIN** as part of the Background Verification Platform.

These APIs accept verification details, validate mandatory fields, and store requests in the database for further verification processing.

---
# 🔁 Verification Retry Mechanism (BE-8)

This module introduces a retry mechanism for verification requests, enabling administrators to manually retry failed or pending verifications while maintaining a full retry history for auditing and monitoring.

The retry system prepares the backend architecture for future automatic retry workflows and external verification integrations.

## 🚀 Features
### Retry Tracking

Verification requests now include two additional fields:

```
retry_count
last_retry_at
```
These fields track:

The number of retry attempts made for a verification request

The timestamp of the most recent retry attempt

This allows the system to monitor retry frequency and manage verification workflows more effectively.

## Retry History Logging

Every retry attempt is recorded in a dedicated audit table.

Table:

verification_retry_history

Each retry record stores:

verification_id

retry_number

retry_status

retry_reason

created_at timestamp

This ensures that every retry action is traceable and provides transparency for debugging and monitoring.

## 🔁 Manual Retry API

Administrators can manually trigger a retry for a verification request using a secure API endpoint.

Endpoint:
```
POST /api/verification/retry/:id
```
Headers required:

x-api-key: <API_KEY>
Authorization: Bearer <JWT_TOKEN>

Example request:

POST /api/verification/retry/5e98e1ca-164a-46d5-92de-30a70fa57c5d

Example response:

{
  "success": true,
  "message": "Retry triggered successfully",
  "data": {
    "retry_count": 1,
    "status": "retrying"
  }
}
## 🔄 Retry Processing Flow
Admin → Retry API
       → Increment retry_count
       → Update last_retry_at
       → Insert retry history record
       → Update verification status to "retrying"

This architecture ensures that retry actions are tracked and controlled within the verification lifecycle.

## 🗄️ Database Changes

### Updated verification_requests Table

```sql
ALTER TABLE verification_requests
ADD COLUMN retry_count INT DEFAULT 0,
ADD COLUMN last_retry_at TIMESTAMP;

CREATE TABLE verification_retry_history (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 verification_id UUID REFERENCES verification_requests(id),
 retry_number INT,
 retry_status VARCHAR(50),
 retry_reason TEXT,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

🧠 Future Enhancements

This retry system prepares the backend for future improvements including:

Automatic retry workers

Scheduled retry jobs

Retry attempt limits

Integration with third-party verification providers (IDfy)

Retry monitoring dashboards

---

# 🔄 Verification API Status Tracking (BE-9)

This module introduces structured tracking for verification API processing and prepares the backend architecture for **Phase 5 external verification integrations**, such as **IDfy**.

Previously, verification requests were stored with a simple status field.  
This enhancement enables the system to track the lifecycle of verification processing, API attempts, and failures.

---

## 🎯 Purpose

The goal of this module is to enable structured monitoring of verification processing so that external verification providers can be integrated without requiring major changes to the database architecture.

This allows the system to:

- Track verification processing states
- Record API failure reasons
- Monitor API call attempts
- Support automated retry workflows
- Enable third-party verification integrations

---

## 🚀 New Fields Added

The `verification_requests` table now includes the following fields:
api_status
failure_reason
last_api_attempt


### Field Descriptions

| Field | Description |
|------|------|
| api_status | Current verification processing state |
| failure_reason | Stores error messages returned by verification APIs |
| last_api_attempt | Timestamp of the latest API attempt |

---

## 📊 Verification Lifecycle

Verification requests now follow a structured lifecycle:
pending → processing → success
pending → processing → failed


### Status Meaning

| Status | Description |
|------|------|
| pending | Verification request created but API not yet triggered |
| processing | Verification API call in progress |
| success | Verification completed successfully |
| failed | Verification failed due to API error or validation issue |

---

## 🔄 Status Initialization

When a verification request is created using the intake APIs:
POST /api/verification/pan
POST /api/verification/aadhaar
POST /api/verification/gstin


The system initializes:
api_status = pending
failure_reason = NULL
last_api_attempt = NULL


---

## 🔁 Processing Update

When verification processing begins (for example via retry or background worker), the system updates:

api_status = processing
last_api_attempt = CURRENT_TIMESTAMP


---

## ❌ Failure Handling

If verification fails due to external API issues, the system records the failure reason.

Example:
api_status = failed
failure_reason = "Verification API timeout"


This information helps administrators diagnose verification failures and monitor API reliability.

---

## 🗄️ Database Changes

The database schema was updated with the following migration:

```sql
ALTER TABLE verification_requests
ADD COLUMN api_status VARCHAR(20) DEFAULT 'pending',
ADD COLUMN failure_reason TEXT,
ADD COLUMN last_api_attempt TIMESTAMP;
```
## 📈 Verification Processing Architecture
Client Request
      ↓
Verification Intake API
      ↓
verification_requests record created
api_status = pending
      ↓
Verification processing begins
api_status = processing
last_api_attempt updated
      ↓
External Verification API
      ↓
Verification Result
   ↓             ↓
Success        Failure
   ↓             ↓
api_status=success
api_status=failed
failure_reason stored
🔮 Future Enhancements

This architecture enables future improvements including:

Integration with IDfy verification APIs

Asynchronous verification workers

Scheduled retry mechanisms

Verification analytics dashboards

API reliability monitoring

✅ Status

Retry-ready backend logic successfully implemented and tested.

# 🚀 Implemented APIs

## PAN Verification Intake

POST `/api/verification/pan`

Example Request

```
{
 "pan_number": "ABCDE1234F",
 "full_name": "Rahul Sharma",
 "dob": "1998-05-10",
 "client_id": "tenant_uuid"
}
```

---

## Aadhaar Verification Intake

POST `/api/verification/aadhaar`

Example Request

```
{
 "masked_aadhaar": "XXXX-XXXX-1234",
 "full_name": "Rahul Sharma",
 "client_id": "tenant_uuid"
}
```

---

## GSTIN Verification Intake

POST `/api/verification/gstin`

Example Request

```
{
 "gstin": "27ABCDE1234F1Z5",
 "business_name": "ABC Traders",
 "client_id": "tenant_uuid"
}
```

---

# 🔎 Validation

Input validation is implemented using **Joi schemas** to ensure:

* Mandatory fields are present
* PAN format validation
* Aadhaar masked format validation
* GSTIN format validation

Invalid requests return standardized error responses.

---

#🗄️ Database Schema

Verification requests are stored in the `verification_requests` table.

```
CREATE TABLE verification_requests (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 document_type VARCHAR(20),
 document_number VARCHAR(50),
 full_name VARCHAR(255),
 dob DATE,
 business_name VARCHAR(255),
 client_id UUID,
 status VARCHAR(50),
 retry_count INT DEFAULT 0,
 last_retry_at TIMESTAMP,
 api_status VARCHAR(20) DEFAULT 'pending',
 failure_reason TEXT,
 last_api_attempt TIMESTAMP,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

All records are stored with the default status:

```
pending_verification
```

---

# 🏢 Multi-Tenant Support
Each verification request includes a `client_id` referencing the clients table
, enabling the system to support multiple organizations using the same platform.

---

# 🛡️ Security

Verification APIs are protected by:

* API Key middleware (`x-api-key`)
* JWT authentication (`Authorization: Bearer token`)
* Rate limiting
* Helmet security headers

---

# 📊 Verification Flow

Client → Verification API → Validation → Database Storage → Status: `pending_verification`

This prepares the system for future integration with external verification providers such as **IDfy**.

---

# ✅ Status

Verification intake APIs for **PAN, Aadhaar, and GSTIN** successfully implemented and tested.

# 🏗️ Tech Stack

Backend: Node.js, Express.js
Database: PostgreSQL
File Handling: Multer
Validation: Joi
Authentication: JWT (jsonwebtoken), bcrypt
Utilities: UUID, dotenv
Security: Helmet, CORS, Compression,API Key Middleware, Rate Limiting

---

# 📁 Project Structure

```
src/
│── config/
│   └── multerConfig.js
│
│── controllers/
│   ├── uploadController.js
│   ├── authController.js
│   ├── tenantController.js
│   └── verificationController.js
│
│── routes/
│   ├── uploadRoutes.js
│   ├── authRoutes.js
│   ├── tenantRoutes.js
│   ├── verificationRoutes.js
│   └── index.js
│
│── middlewares/
│   ├── errorMiddleware.js
│   ├── validate.js
│   ├── authMiddleware.js
│   └── roleMiddleware.js
│
│── validator/
│   ├── authValidator.js
│   ├── userValidator.js
│   └── verificationValidator.js
│
│── utils/
│   └── apiResponse.js
│
│── db/
│   └── db.js
│
│── app.js

uploads/  ← temporary file storage  
server.js
```

---

# 🔌 API Endpoints

---

# 📤 File Upload

POST /api/upload

Request:

Content-Type: multipart/form-data
Field: file

Supported File Types:

* PDF
* JPEG
* PNG

Example Response:

```
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

# 🔐 Authentication APIs

## Login

POST /api/auth/login

Request:

```
{
  "email": "user@example.com",
  "password": "password123"
}
```

Response:

```
{
  "success": true,
  "data": {
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

---

## Refresh Token

POST /api/auth/refresh

Request:

```
{
  "refreshToken": "token"
}
```

Response:

```
{
  "accessToken": "new_access_token"
}
```

---

## Logout

POST /api/auth/logout

Request:

```
{
  "refreshToken": "token"
}
```

Logout removes refresh token from database and invalidates session.

---
# Verification APIs
PAN Verification
POST /api/verification/pan

Request:

{
  "pan_number": "ABCDE1234F",
  "full_name": "Rahul Sharma",
  "dob": "1998-05-10",
  "client_id": "tenant_uuid"
}
Aadhaar Verification
POST /api/verification/aadhaar

Request:

{
  "masked_aadhaar": "XXXX-XXXX-1234",
  "full_name": "Rahul Sharma",
  "client_id": "tenant_uuid"
}
GSTIN Verification
POST /api/verification/gstin

Request:

{
  "gstin": "27ABCDE1234F1Z5",
  "business_name": "ABC Traders",
  "client_id": "tenant_uuid"
}
# 🏢 Protected APIs Example

Authorization Header:

```
Authorization: Bearer <access_token>
```

Example:

GET /api/tenants

Admin-only example:

POST /api/tenants

---

# 🧠 Architecture Improvements

## Standard API Response Format

All APIs return:

```
{
  "success": true,
  "message": "Operation successful",
  "data": {}
}
```

Errors:

```
{
  "success": false,
  "message": "Error description"
}
```

---

## Centralized Error Handling

A global middleware handles all application errors ensuring consistent responses.

---

## Input Validation Middleware

Implemented using Joi for:

* Data integrity
* Early error detection
* Cleaner controllers

---

## API Versioning

Supports versioned APIs:

```
/api/v1/...
```

Allows backward compatibility for future releases.

---

# 🛡️ Authentication Flow

1. User logs in with credentials
2. Server verifies password (bcrypt)
3. Access and refresh tokens are generated
4. Access token is used for protected APIs
5. Refresh token generates new access tokens
6. Logout removes refresh token from database
7. Middleware validates token and role

---

# 🗄️ Database Schema

## Documents Table

```
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

## Users Table

```
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Refresh Tokens Table

```
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Tenants Table

```
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    tier VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

# ⚙️ Installation & Setup

Clone Repository:

```
git clone <repo-url>
cd bgv-backend
```

Install Dependencies:

```
npm install
```

Configure Environment Variables:

Create `.env` file:

```
PORT=5001
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=bgv_platform
DB_HOST=localhost
DB_PORT=5432

ACCESS_TOKEN_SECRET=your_secret
REFRESH_TOKEN_SECRET=your_secret
```

Create Upload Folder:

```
mkdir uploads
```

Run Server:

```
node server.js
```

Server runs at:

```
http://localhost:5001
```

---

# 🧪 Testing

## File Upload

```
curl -X POST http://localhost:5001/api/upload -F "file=@demo.pdf"
```

## Login

```
curl -X POST http://localhost:5001/api/auth/login \
-H "Content-Type: application/json" \
-d '{"email":"admin@test.com","password":"password123"}'
```

---

# 🔮 Future Enhancements

* IDfy integration
* Cloud storage (AWS S3)
* File deletion API
* Multiple uploads
* Async processing
* API rate limiting
* Advanced role management

---

# 👨‍💻 Author

Niel Mandhare
Backend Developer Intern

---

# ✅ Status


# ✅ Status

File upload infrastructure, authentication system, secure backend foundation, verification intake APIs, verification retry mechanism, and verification API status tracking successfully implemented and tested.
---
