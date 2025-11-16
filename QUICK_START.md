# Quick Start Guide

## 1️⃣ Setup (5 minutes)

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your values (see AUTH_SETUP.md for details)
# Minimum required:
# MONGODB_URI=mongodb://localhost:27017/one-go-security
# JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
# EMAIL_HOST=smtp.gmail.com
# EMAIL_USER=your-email@gmail.com  
# EMAIL_PASSWORD=<Gmail app password>
# TWILIO_ACCOUNT_SID=
# TWILIO_AUTH_TOKEN=
# TWILIO_VERIFY_SERVICE_SID=
```

## 2️⃣ Install Dependencies

```bash
cd auth/server
npm install
```

## 3️⃣ Start Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

Expected output:
```
==============================================================================
🚀 ONE-Go Security Backend - Authentication System
==============================================================================
📍 Server: http://localhost:5000
🌍 Environment: development
==============================================================================

📋 Services:
   ✅ Authentication - /api/auth/*
   ✅ Health Check - /api/health

🔐 Configuration:
   ✅ MongoDB: ready
   ✅ JWT: set
   ✅ Email: configured
   ✅ SMS: configured
```

## 4️⃣ Test It

### Health Check
```bash
curl http://localhost:5000/api/health
```

### Register User
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "phone": "+12025551234",
    "password": "Password123!"
  }'
```

### Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Password123!"
  }'
```

### Get Profile (Protected)
```bash
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

## 📚 Full Documentation

- **Setup Details**: See `AUTH_SETUP.md`
- **Integration Details**: See `INTEGRATION_SUMMARY.md`
- **All Endpoints**: See `AUTH_SETUP.md` → Authentication Endpoints section

## ✅ What's Working

- User registration with email & phone OTP verification
- User login with JWT tokens
- Password reset via email
- Profile management
- Account deletion
- Rate limiting
- Input validation
- Error handling

## 🔧 Configuration Files

| File | Purpose |
|------|---------|
| `.env` | Your local configuration (create from `.env.example`) |
| `.env.example` | Template with all available options |
| `AUTH_SETUP.md` | Complete setup and API documentation |
| `INTEGRATION_SUMMARY.md` | Technical integration details |

## 🚨 Common Issues

**"MongoDB connection error"**
→ Ensure MongoDB is running: `mongod`
→ Check MONGODB_URI in .env

**"Email not sending"**
→ Check EMAIL_* variables in .env
→ For Gmail: Use app password from myaccount.google.com/apppasswords
→ Check server logs for detailed error

**"Invalid JWT token"**
→ Token may have expired (default: 7 days)
→ JWT_SECRET must be the same on creation and verification
→ Check Authorization header format: `Bearer TOKEN`

**"Too many requests"**
→ You've hit rate limits (50/15min for auth)
→ Wait a few minutes and retry

## 📞 Support

- Check troubleshooting in `AUTH_SETUP.md`
- Review server logs for detailed error messages
- Ensure all environment variables are set

## 🎯 Next Steps

1. **For Frontend Integration**: Check AUTH_SETUP.md → "Example: Complete Registration Flow"
2. **For 2FA**: The code is scaffolded, ready to implement
3. **For Production**: Update environment to `NODE_ENV=production`

---

**Quick Ref**: Routes are at `/api/auth/*` - List: `register`, `login`, `logout`, `forgot-password`, `reset-password`, `me` (profile)
