# Authentication Setup Guide

This guide explains how to set up and use the authentication system in the ONE-Go Security backend.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Environment Variables](#environment-variables)
3. [Authentication Endpoints](#authentication-endpoints)
4. [Features](#features)
5. [Troubleshooting](#troubleshooting)

## Quick Start

### 1. Setup Environment Variables

Copy `.env.example` to `.env` and fill in your configuration:

```bash
cp .env.example .env
```

**Essential variables to configure:**
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Random string for JWT signing
- `EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASSWORD` - Email configuration
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` - SMS setup

### 2. Install Dependencies

```bash
npm install
```

All required packages are already listed in `package.json`.

### 3. Start the Backend

```bash
# Development with auto-reload
npm run dev

# Production
npm start
```

The server will start on `http://localhost:5000` (or your configured PORT).

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/one-go` |
| `JWT_SECRET` | Secret key for JWT tokens | Random 32-character string |
| `EMAIL_HOST` | SMTP server host | `smtp.gmail.com` |
| `EMAIL_USER` | SMTP login email | `your-email@gmail.com` |
| `EMAIL_PASSWORD` | SMTP password (Gmail: app password) | From Google App Passwords |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID | From Twilio Console |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token | From Twilio Console |
| `TWILIO_VERIFY_SERVICE_SID` | Twilio Verify Service SID | From Twilio Verify Setup |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `5000` |
| `NODE_ENV` | Environment | `development` |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:5173` |
| `JWT_EXPIRE` | JWT token expiry | `7d` |
| `ENABLE_2FA` | Enable 2FA features | `true` |

## Authentication Endpoints

### Public Endpoints (No Authentication Required)

#### 1. Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "password": "SecurePass123!"
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "hexstring...",
  "requiresOTP": true,
  "message": "OTPs sent to email and phone",
  "devEmailOTP": "123456" // Only in development
}
```

**Next steps:** 
- User receives OTP via email and SMS
- Call `/verify-email-otp` endpoint
- Then call `/verify-mobile-otp` endpoint

#### 2. Verify Email OTP
```http
POST /api/auth/verify-email-otp
Content-Type: application/json

{
  "sessionId": "hexstring...",
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

#### 3. Verify Mobile OTP (Complete Registration)
```http
POST /api/auth/verify-mobile-otp
Content-Type: application/json

{
  "sessionId": "hexstring...",
  "otp": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "mongodb-id",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1234567890"
  },
  "message": "Registration successful"
}
```

#### 4. Resend OTP
```http
POST /api/auth/resend-otp
Content-Type: application/json

{
  "sessionId": "hexstring...",
  "type": "email" // or "mobile"
}
```

#### 5. Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "SecurePass123!"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "mongodb-id",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "twoFactorEnabled": false
  }
}
```

#### 6. Forgot Password
```http
POST /api/auth/forgot-password
Content-Type: application/json

{
  "email": "john@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "If an account exists for this email, you will receive a password reset link"
}
```

User receives email with reset link: `http://frontend-url/reset-password?token=TOKEN`

#### 7. Reset Password
```http
POST /api/auth/reset-password
Content-Type: application/json

{
  "token": "token-from-email",
  "password": "NewSecurePass456!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

#### 8. Logout
```http
POST /api/auth/logout
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### Protected Endpoints (Requires JWT Token)

Include token in Authorization header: `Authorization: Bearer YOUR_TOKEN`

#### 1. Get User Profile
```http
GET /api/auth/me
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "mongodb-id",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "isEmailVerified": true,
    "isPhoneVerified": true,
    "twoFactorEnabled": false,
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

#### 2. Update User Profile
```http
PUT /api/auth/me
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "+1234567890"
}
```

#### 3. Delete Account
```http
DELETE /api/auth/account
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response:**
```json
{
  "success": true,
  "message": "Account deleted successfully"
}
```

## Features

### 1. Email & Phone Verification

- Automatic OTP generation (6-digit codes)
- Email verification during registration
- Phone verification via Twilio Verify
- Resend OTP functionality
- 10-minute OTP expiry
- 5 attempt limit per OTP

### 2. JWT Authentication

- Secure token-based authentication
- Automatic token generation on login
- Protected routes middleware
- Configurable token expiry (default: 7 days)

### 3. Password Management

- Secure password hashing (bcryptjs)
- Password reset via email link
- 8-character minimum password requirement
- Password reset token expiry (1 hour)

### 4. User Profile Management

- View profile information
- Update name, email, phone
- Delete account (permanent)
- Email uniqueness validation

### 5. Account Security

- Input validation (email, phone, password)
- Rate limiting on auth endpoints
- CORS configuration
- Secure password comparison
- Error message security (no email enumeration)

## Troubleshooting

### Issue: Email not sending

**Solutions:**
1. Check `EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASSWORD` in `.env`
2. For Gmail: Use app-specific password from https://myaccount.google.com/apppasswords
3. Enable "Less secure app access" if using regular Gmail password
4. Check server logs for detailed error messages
5. In development mode, OTP is logged to console

**Test email connection:**
```javascript
// Add this temporarily to test email
const { sendEmail } = require('./src/utils/mailer');
sendEmail('test@example.com', '123456').then(console.log);
```

### Issue: SMS not sending

**Solutions:**
1. Check Twilio credentials in `.env`
2. Verify phone number format: `+COUNTRYCODE...` (e.g., `+12025551234`)
3. Check Twilio Verify Service SID is correct
4. Ensure Twilio account has balance

### Issue: JWT token invalid

**Solutions:**
1. Token has expired (default: 7 days)
2. `JWT_SECRET` mismatch between creation and verification
3. Malformed Authorization header (should be `Bearer TOKEN`)
4. Token was issued before `JWT_SECRET` was changed

### Issue: MongoDB connection failed

**Solutions:**
1. Ensure MongoDB is running: `mongod`
2. Check `MONGODB_URI` connection string
3. For Atlas: Whitelist IP address in Network Access
4. Check network connectivity

## Example: Complete Registration Flow

```javascript
// 1. Register
const registerRes = await fetch('http://localhost:5000/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'John Doe',
    email: 'john@example.com',
    phone: '+1234567890',
    password: 'SecurePass123!'
  })
});
const { sessionId, devEmailOTP } = await registerRes.json();

// 2. Verify email OTP
const verifyEmailRes = await fetch('http://localhost:5000/api/auth/verify-email-otp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId,
    otp: devEmailOTP // Use dev OTP from console in development
  })
});

// 3. Verify mobile OTP
const verifyMobileRes = await fetch('http://localhost:5000/api/auth/verify-mobile-otp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId,
    otp: 'RECEIVED_FROM_SMS'
  })
});
const { token } = await verifyMobileRes.json();

// 4. Use token for authenticated requests
const profileRes = await fetch('http://localhost:5000/api/auth/me', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { user } = await profileRes.json();
console.log('Logged in as:', user.name);
```

## Security Best Practices

1. **Never commit `.env`** - Add to `.gitignore`
2. **Use strong JWT_SECRET** - Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
3. **Enable HTTPS in production** - Set secure cookie flag
4. **Rotate secrets regularly** - Update JWT_SECRET periodically
5. **Monitor rate limits** - Watch for brute force attempts
6. **Use email verification** - Prevent fake email registration
7. **Require strong passwords** - Enforce 8+ characters
8. **Enable 2FA** - Add extra security layer

## Support & Development

For issues, bugs, or feature requests:
1. Check the troubleshooting section above
2. Review server logs: `NODE_ENV=development npm run dev`
3. Test endpoints with Postman or curl
4. Check `.env` configuration

## Next Steps

- Implement 2FA (TOTP, backup codes)
- Add OAuth providers (Google, GitHub)
- Implement refresh tokens
- Add audit logging
- Setup email templates
- Add rate limiting per user
