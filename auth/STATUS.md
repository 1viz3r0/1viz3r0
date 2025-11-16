# Auth Integration Status

This document tracks the progress of extracting auth logic from the `auth/` folder and integrating it into the main repository structure.

## Stack Detection

**Detected Stack:**
- **Backend:** Node.js/Express.js with MongoDB (Mongoose)
- **Database:** MongoDB
- **Frontend:** React/TypeScript with Vite
- **Authentication:** JWT (JSON Web Tokens)
- **Password Hashing:** bcryptjs
- **Email:** nodemailer (Gmail SMTP)
- **SMS:** Twilio Verify API

**Detection Rationale:**
- `auth/server/package.json` shows Express, Mongoose, jsonwebtoken, bcryptjs dependencies
- `auth/server/server.js` uses Express with MongoDB connection
- `auth/server/models/User.js` uses Mongoose schema
- `auth/server/routes/auth.js` uses JWT tokens for authentication
- `auth/server/utils/email.js` uses nodemailer
- `auth/server/utils/sms.js` uses Twilio SDK

---

## Auth Folder Structure

### Server Files (`auth/server/`)

| File | Purpose |
|------|---------|
| `server.js` | Main Express server entry point with middleware setup |
| `routes/auth.js` | All authentication routes (register, login, OTP verification, Google OAuth, etc.) |
| `models/User.js` | Mongoose User model with password hashing |
| `models/Session.js` | Mongoose Session model for OTP verification sessions |
| `middleware/auth.js` | JWT authentication middleware (`protect` function) |
| `middleware/errorHandler.js` | Global error handler middleware |
| `utils/email.js` | Email sending utility using nodemailer (placeholder for real mailer) |
| `utils/sms.js` | SMS OTP utility using Twilio Verify API (placeholder for real SMS) |
| `utils/otp.js` | OTP generation and verification utilities |
| `utils/validation.js` | Input validation utilities (email, password, phone, URL) |
| `config/db.js` | MongoDB connection configuration (currently unused in server.js) |

### Client Files (`auth/client/`)
Note: Client files are React/TypeScript and will remain in `auth/client/` - only server-side logic is being extracted.

---

## Proposed File Mapping

### Target Structure (Conventional Express Layout)

| Source File | Target Location | Notes |
|-------------|----------------|-------|
| `auth/server/models/User.js` | `src/models/User.js` | User model - may need to adapt to main repo structure |
| `auth/server/models/Session.js` | `src/models/Session.js` | Session model for OTP verification |
| `auth/server/routes/auth.js` | `src/routes/authRoutes.js` | Split into controller + routes |
| `auth/server/middleware/auth.js` | `src/middleware/authMiddleware.js` | Auth middleware |
| `auth/server/middleware/errorHandler.js` | `src/middleware/errorHandler.js` | Error handler (if not exists) |
| `auth/server/utils/email.js` | `src/utils/mailer.js` | Email utility with placeholder |
| `auth/server/utils/sms.js` | `src/utils/sms.js` | SMS utility with placeholder |
| `auth/server/utils/otp.js` | `src/utils/twofactor.js` | OTP utilities for 2FA |
| `auth/server/utils/validation.js` | `src/utils/validation.js` | Validation utilities |
| `auth/server/config/db.js` | `src/config/db.js` | DB config (if needed) |

### New Files to Create

| File | Purpose |
|------|---------|
| `src/controllers/authController.js` | Extract controller logic from routes |
| `src/services/authService.js` | Business logic for auth operations |
| `.env.example` | Environment variables template |
| `auth/README-INTEGRATE.md` | Integration guide |

---

## Module Progress

### ✅ Module A — Core user and registration
- [x] Create/verify User model (`src/models/User.js`)
- [x] Create Session model (`src/models/Session.js`)
- [x] Create validation utilities (`src/utils/validation.js`)
- [x] Create OTP utilities (`src/utils/otp.js`)
- [x] Create email utility with placeholder (`src/utils/mailer.js`)
- [x] Create SMS utility with placeholder (`src/utils/sms.js`)
- [x] Implement authService registration logic (`src/services/authService.js`)
- [x] Implement authController (`src/controllers/authController.js`)
- [x] Create auth routes (`src/routes/authRoutes.js`)
- [x] Create auth middleware (`src/middleware/authMiddleware.js`)
- [x] Create error handler (`src/middleware/errorHandler.js`)
- [x] Add test script (`test-auth-register.js`)
- [x] Update STATUS.md

**Status:** ✅ Complete - Registration flow with OTP verification is implemented.

**Files Created:**
- `src/models/User.js` - User model with password hashing
- `src/models/Session.js` - Session model for OTP verification
- `src/utils/validation.js` - Input validation utilities
- `src/utils/otp.js` - OTP generation and verification
- `src/utils/mailer.js` - Email utility (placeholder - needs wiring)
- `src/utils/sms.js` - SMS utility (placeholder - needs wiring)
- `src/services/authService.js` - Business logic for auth
- `src/controllers/authController.js` - Request handlers
- `src/routes/authRoutes.js` - Express routes
- `src/middleware/authMiddleware.js` - JWT auth middleware
- `src/middleware/errorHandler.js` - Global error handler
- `test-auth-register.js` - Test script for registration

**Endpoints Implemented:**
- `POST /api/auth/register` - Initiate registration (sends OTPs)
- `POST /api/auth/verify-email-otp` - Verify email OTP
- `POST /api/auth/verify-mobile-otp` - Verify mobile OTP and complete registration
- `POST /api/auth/resend-otp` - Resend OTP (email or mobile)

**How to Test:**
1. Ensure MongoDB is running and configured
2. Set environment variables (see `.env.example` - to be created in Module E)
3. Mount routes in your main server:
   ```javascript
   app.use('/api/auth', require('./src/routes/authRoutes'));
   ```
4. Run test script: `node test-auth-register.js`

**TODO for Module B:**
- Add JWT token generation in `verifyMobileOTP` completion
- Implement login endpoint
- Implement refresh token flow
- Implement logout endpoint

### ⏳ Module B — Login, tokens, logout
- [ ] Implement login flow
- [ ] Implement token refresh
- [ ] Implement logout
- [ ] Add tests/scripts
- [ ] Update STATUS.md

### ⏳ Module C — Forgot/Reset password
- [ ] Implement forgot password endpoint
- [ ] Implement reset password endpoint
- [ ] Add tests/scripts
- [ ] Update STATUS.md

### ⏳ Module D — 2FA (TOTP, Email OTP, backup codes)
- [ ] Implement TOTP setup/verify
- [ ] Implement email OTP
- [ ] Implement backup codes
- [ ] Implement remember-device
- [ ] Add require2FA middleware
- [ ] Add tests/scripts
- [ ] Update STATUS.md

### ⏳ Module E — Integration and deployable packaging
- [ ] Mount auth routes in main app
- [ ] Update start scripts
- [ ] Add .env.example
- [ ] Add Dockerfile/docker-compose
- [ ] Add integration README
- [ ] Run static checks
- [ ] Update STATUS.md

---

## Notes

- All email/SMS calls use placeholders - manual wiring required
- Database connection handled in server.js - may need to adapt
- JWT strategy: Access token only (refresh tokens to be added in Module B)
- Session-based OTP verification for registration flow

---

**Last Updated:** Initial setup

