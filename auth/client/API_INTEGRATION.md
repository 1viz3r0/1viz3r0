# API Integration Guide for OTP and Security Features

This document outlines all the API endpoints needed for your Express/Node.js backend.

## Base URL
Set `VITE_API_BASE_URL` in your `.env` file to your backend URL (e.g., `http://localhost:5000/api`)

## Authentication Endpoints with OTP

### 1. Register (Step 1: Create Account)
**POST** `/auth/register`

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "password": "password123"
}
```

**Response:**
```json
{
  "sessionId": "uuid-session-id",
  "requiresOTP": true,
  "message": "OTP sent to email and mobile"
}
```

**Implementation Notes:**
- Create user record (unverified status)
- Generate 6-digit OTP for email
- Generate 6-digit OTP for mobile
- Send OTP to email using your Node package (nodemailer, sendgrid, etc.)
- Send OTP to mobile using your SMS package (twilio, sns, etc.)
- Store OTPs with sessionId and expiry (5-10 minutes)
- Return sessionId for verification steps

---

### 2. Verify Email OTP (Step 2)
**POST** `/auth/verify-email-otp`

**Request Body:**
```json
{
  "sessionId": "uuid-session-id",
  "otp": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

**Implementation Notes:**
- Validate OTP against sessionId
- Mark email as verified in database
- Keep session active for mobile verification

---

### 3. Verify Mobile OTP (Step 3: Final)
**POST** `/auth/verify-mobile-otp`

**Request Body:**
```json
{
  "sessionId": "uuid-session-id",
  "otp": "654321"
}
```

**Response:**
```json
{
  "token": "jwt-auth-token",
  "user": {
    "id": "user-id",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1234567890"
  }
}
```

**Implementation Notes:**
- Validate mobile OTP
- Mark user as fully verified
- Generate JWT token
- Return user data and token

---

### 4. Resend OTP
**POST** `/auth/resend-otp`

**Request Body:**
```json
{
  "sessionId": "uuid-session-id",
  "type": "email" // or "mobile"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP resent successfully"
}
```

**Implementation Notes:**
- Generate new OTP
- Send to email or mobile based on type
- Update stored OTP with new expiry

---

### 5. Login (Standard)
**POST** `/auth/login`

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "token": "jwt-auth-token",
  "user": {
    "id": "user-id",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1234567890"
  }
}
```

---

### 6. Google OAuth Login
**POST** `/auth/google`

**Request Body:**
```json
{
  "idToken": "google-id-token"
}
```

**Response (New User):**
```json
{
  "requiresOTP": true,
  "sessionId": "uuid-session-id",
  "message": "Please verify your phone number"
}
```

**Response (Existing User):**
```json
{
  "token": "jwt-auth-token",
  "user": {
    "id": "user-id",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1234567890"
  }
}
```

**Implementation Notes:**
- Verify Google ID token with Google API
- Check if user exists by email
- If exists: return token
- If new: create user, send mobile OTP, return sessionId

---

### 7. Verify Google OAuth Mobile OTP
**POST** `/auth/verify-google-otp`

**Request Body:**
```json
{
  "sessionId": "uuid-session-id",
  "phone": "+1234567890",
  "otp": "123456"
}
```

**Response:**
```json
{
  "token": "jwt-auth-token",
  "user": {
    "id": "user-id",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1234567890"
  }
}
```

---

## Security Scan Endpoints (Phase 3)

### 8. Scan Page (OWASP ZAP Integration)
**POST** `/scan/page`

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "url": "https://example.com"
}
```

**Response:**
```json
{
  "scanId": "scan-uuid",
  "status": "initiated",
  "message": "Page scan started"
}
```

**Implementation Notes:**
- Integrate with OWASP ZAP API
- Create scan job in database
- Return scanId for status checking

---

### 9. Get Scan Status
**GET** `/scan/status?scanId={scanId}`

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "status": "safe", // or "unsafe"
  "critical": 0,
  "high": 2,
  "medium": 5,
  "low": 10,
  "details": {
    "alerts": [...]
  }
}
```

---

### 10. Scan Download (ClamAV Integration)
**POST** `/scan/download`

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "fileUrl": "https://example.com/file.pdf",
  "fileName": "document.pdf"
}
```

**Response:**
```json
{
  "status": "clean", // or "infected"
  "threats": [],
  "message": "File is safe"
}
```

**Implementation Notes:**
- Download file temporarily
- Scan with ClamAV
- Log results
- Clean up temp file

---

### 11. Toggle Ad Blocker
**POST** `/adblock/toggle`

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "enabled": true
}
```

**Response:**
```json
{
  "success": true,
  "enabled": true
}
```

---

### 12. Check Passwords
**GET** `/passwords/check`

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "weak": 3,
  "medium": 5,
  "strong": 12,
  "passwords": [
    {
      "site": "facebook.com",
      "strength": "weak"
    }
  ]
}
```

**Implementation Notes:**
- Check saved passwords strength using algorithm
- Return statistics

---

### 13. Clean Data
**DELETE** `/logs/recent`

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "success": true,
  "message": "Recent logs and cache cleared"
}
```

---

### 14. Network Speed Check (LibreSpeed API)
**GET** `/network/check`

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "download": 95.5,
  "upload": 45.2,
  "ping": 12,
  "jitter": 2
}
```

**Implementation Notes:**
- Integrate with LibreSpeed API
- Return network metrics

---

### 15. Get Activity Logs
**GET** `/logs?type={type}`

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `type` (optional): `pages`, `downloads`, `network`, `passwords`

**Response:**
```json
{
  "logs": [
    {
      "id": "log-id",
      "timestamp": "2024-01-15T10:30:00Z",
      "type": "page_scan",
      "result": "safe",
      "threatLevel": "none",
      "source": "https://example.com",
      "details": {}
    }
  ]
}
```

---

### 16. Export Logs
**GET** `/logs/export?type={type}`

**Headers:** `Authorization: Bearer {token}`

**Query Parameters:**
- `type` (required): `pages`, `downloads`, `network`, `passwords`

**Response:**
```json
{
  "downloadUrl": "https://your-api.com/exports/logs-uuid.csv"
}
```

**Implementation Notes:**
- Generate CSV file
- Store temporarily or use signed URL
- Return download link

---

## NPM Packages Recommended

### For OTP:
- **Email OTP:** `nodemailer`, `@sendgrid/mail`
- **SMS OTP:** `twilio`, `aws-sdk` (SNS)
- **OTP Generation:** `otp-generator`

### For Security Features:
- **OWASP ZAP:** `zaproxy` API client
- **ClamAV:** `clamscan`
- **Password Strength:** `zxcvbn`

### General:
- **Authentication:** `jsonwebtoken`, `bcrypt`
- **Google OAuth:** `google-auth-library`
- **Database:** `mongoose` (MongoDB)

---

## Security Best Practices

1. **OTP Storage:**
   - Store OTPs hashed
   - Set expiry (5-10 minutes)
   - Limit resend attempts (max 3-5)

2. **Rate Limiting:**
   - Implement rate limits on OTP endpoints
   - Use `express-rate-limit`

3. **Token Management:**
   - Use JWT with short expiry
   - Implement refresh tokens
   - Store tokens securely

4. **Input Validation:**
   - Validate all inputs
   - Sanitize URLs for scanning
   - Use `express-validator`

5. **Logging:**
   - Log all security events
   - Don't log sensitive data (passwords, OTPs)
   - Use `winston` or `pino`
