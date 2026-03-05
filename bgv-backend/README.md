📂 BE-5: Base File Upload Infrastructure + Authentication System

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

## Security Testing

### Unauthorized Access


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

# 🗄️ Database Schema

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
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

All records are stored with the default status:

```
pending_verification
```

---

# 🏢 Multi-Tenant Support

Each verification request includes a `client_id` referencing the tenant table, enabling the system to support multiple organizations using the same platform.

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
│   └── tenantController.js
│
│── routes/
│   ├── uploadRoutes.js
│   ├── authRoutes.js
│   ├── tenantRoutes.js
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
│   └── userValidator.js
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


File upload infrastructure, authentication system, and secure backend foundation successfully implemented and tested.

---
