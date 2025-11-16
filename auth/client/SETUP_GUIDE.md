# ONE-Go Security - Local Setup Guide

This guide provides step-by-step instructions to run the ONE-Go Security web app and browser extension locally.

## Prerequisites

Before starting, ensure you have the following installed:

- **Node.js** (v18 or higher): [Download](https://nodejs.org/)
- **npm** or **yarn** or **bun**: Package manager (npm comes with Node.js)
- **Git**: [Download](https://git-scm.com/)

## Part 1: Web Application Setup

### Step 1: Clone the Repository

```bash
git clone <your-repository-url>
cd one-go-security
```

### Step 2: Install Dependencies

Using npm:
```bash
npm install
```

Using yarn:
```bash
yarn install
```

Using bun:
```bash
bun install
```

### Step 3: Configure Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit the `.env` file with your backend API URL:

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

### Step 4: Start Development Server

```bash
npm run dev
```

The web app will be available at: **http://localhost:5173**

## Part 2: Browser Extension Setup

### Step 1: Build the Extension

From the project root:

```bash
npm run build:extension
```

This creates two builds:
- `dist/` - Web application build
- `dist-extension/` - Browser extension build

### Step 2: Load Extension in Chrome

1. Open Chrome and navigate to: `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `dist-extension` folder from your project
5. The extension icon will appear in your toolbar

### Step 3: Test Extension

1. Click the extension icon in your browser toolbar
2. The popup will open showing login/register screens
3. Register a new account or login with existing credentials

## Part 3: Backend API Setup (Required)

The frontend requires a backend API to function. Follow these steps to set up the Express/Node.js backend.

### Backend Requirements

- **Node.js** (v18+)
- **MongoDB** (local or Atlas)
- **npm** or **yarn**

### Step 1: Create Backend Project

```bash
mkdir one-go-security-backend
cd one-go-security-backend
npm init -y
```

### Step 2: Install Backend Dependencies

```bash
npm install express mongoose cors dotenv bcryptjs jsonwebtoken
npm install nodemailer twilio otp-generator
npm install express-rate-limit helmet express-validator
npm install -D @types/node @types/express typescript ts-node nodemon
```

### Step 3: Backend Environment Variables

Create `.env` file in backend directory:

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/one-go-security
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRES_IN=7d

# Email Configuration (Gmail example)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password

# SMS Configuration (Twilio)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=your-twilio-phone-number

# Google OAuth (Optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback

# Security Scanning (Optional)
OWASP_ZAP_API_URL=http://localhost:8080
CLAMAV_API_URL=http://localhost:3310

# LibreSpeed API (Optional)
LIBRESPEED_API_URL=http://localhost:8000

# Frontend URL
FRONTEND_URL=http://localhost:5173
```

### Step 4: Start MongoDB

**Local MongoDB:**
```bash
mongod --dbpath /path/to/your/data/directory
```

**MongoDB Atlas:**
- Create account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
- Create cluster and get connection string
- Update `MONGODB_URI` in `.env`

### Step 5: Backend Implementation

Refer to `API_INTEGRATION.md` for complete API specifications. The backend should implement:

1. **Authentication Endpoints**
   - POST `/api/auth/register` - User registration
   - POST `/api/auth/verify-email-otp` - Email OTP verification
   - POST `/api/auth/verify-mobile-otp` - Mobile OTP verification
   - POST `/api/auth/resend-otp` - Resend OTP
   - POST `/api/auth/login` - User login
   - POST `/api/auth/google` - Google OAuth
   - POST `/api/auth/verify-google-otp` - Google OTP verification
   - POST `/api/auth/forgot-password` - Password reset request
   - POST `/api/auth/reset-password` - Password reset
   - PUT `/api/auth/profile` - Update profile
   - POST `/api/auth/change-password` - Change password
   - DELETE `/api/auth/account` - Delete account

2. **Security Scanning Endpoints**
   - POST `/api/scan/page` - Scan webpage
   - POST `/api/scan/download` - Scan file

3. **Privacy Endpoints**
   - POST `/api/privacy/check-passwords` - Password strength check
   - POST `/api/privacy/clean-data` - Clean user data

4. **Network Endpoint**
   - GET `/api/network/check` - Network speed test

5. **Activity Logs Endpoints**
   - GET `/api/logs` - Get activity logs
   - POST `/api/logs` - Create activity log
   - GET `/api/logs/export` - Export logs

### Step 6: Start Backend Server

```bash
npm start
```

Backend will run at: **http://localhost:5000**

## Part 4: Testing the Complete Setup

### Test Web Application

1. Navigate to `http://localhost:5173`
2. Click "Get Started" or "Register"
3. Fill in registration form
4. Enter OTP codes sent to email/phone
5. Login and access dashboard

### Test Extension

1. Click extension icon in toolbar
2. Login with same credentials
3. Test features:
   - **Protection Tab**: Page scan, ad blocker
   - **Privacy Tab**: Password checker, data cleanup
   - **Tools Tab**: Network check, dashboard link

### Test Auth Synchronization

1. Login via web app
2. Open extension popup - should show logged-in state
3. Logout from extension
4. Refresh web app - should show logged-out state

## Part 5: Development Tips

### Hot Reload

The development server supports hot reload:
- Changes to `.tsx`, `.ts`, `.css` files reload automatically
- Extension requires rebuilding: `npm run build:extension`

### Debug Console Logs

**Web App:**
- Open browser DevTools (F12)
- Check Console tab for errors

**Extension:**
- Right-click extension popup → "Inspect"
- Opens DevTools for extension popup

### Extension Content Script

To debug content script:
1. Open webpage where extension is active
2. Open DevTools (F12)
3. Check Console for "ONE-Go Security: Content script loaded"

## Part 6: Common Issues & Solutions

### Issue: Extension not loading

**Solution:**
```bash
npm run build:extension
```
Then reload extension in `chrome://extensions/`

### Issue: API connection failed

**Solutions:**
1. Verify backend is running: `http://localhost:5000`
2. Check `.env` has correct `VITE_API_BASE_URL`
3. Ensure CORS is enabled in backend

### Issue: OTP not received

**Solutions:**
1. Check email/Twilio credentials in backend `.env`
2. For Gmail, use App Password, not regular password
3. Check spam folder for emails
4. Verify Twilio phone number is verified

### Issue: MongoDB connection failed

**Solutions:**
1. Ensure MongoDB is running
2. Check `MONGODB_URI` in backend `.env`
3. For Atlas, whitelist your IP address

### Issue: Extension auth not syncing

**Solutions:**
1. Verify content script loaded (check browser console)
2. Check `manifest.json` has correct permissions
3. Reload extension and webpage

## Part 7: Build for Production

### Build Web Application

```bash
npm run build
```

Output: `dist/` directory

### Build Extension

```bash
npm run build:extension
```

Output: `dist-extension/` directory

### Deploy Web Application

Deploy `dist/` folder to:
- **Vercel**: `vercel deploy`
- **Netlify**: Drag & drop `dist/` folder
- **AWS S3**: Upload to S3 bucket

### Package Extension

1. Build extension: `npm run build:extension`
2. Go to `chrome://extensions/`
3. Click "Pack extension"
4. Select `dist-extension` folder
5. Generates `.crx` file for distribution

## Part 8: Environment Variables Reference

### Frontend (.env)

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

### Backend (.env)

```env
# Server
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/one-go-security

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# Email (Gmail)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password

# SMS (Twilio)
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
TWILIO_PHONE_NUMBER=+1234567890

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback

# Security APIs
OWASP_ZAP_API_URL=http://localhost:8080
CLAMAV_API_URL=http://localhost:3310
LIBRESPEED_API_URL=http://localhost:8000

# Frontend
FRONTEND_URL=http://localhost:5173
```

## Part 9: NPM Scripts Reference

```json
{
  "dev": "Start development server",
  "build": "Build web application",
  "build:extension": "Build browser extension",
  "preview": "Preview production build",
  "lint": "Run ESLint"
}
```

## Part 10: Project Structure

```
one-go-security/
├── src/
│   ├── components/        # Shared UI components
│   ├── contexts/          # React contexts (Auth)
│   ├── extension/         # Extension-specific code
│   │   ├── components/    # Extension components
│   │   ├── lib/           # Extension utilities
│   │   ├── popup.tsx      # Extension popup entry
│   │   ├── content.ts     # Content script
│   │   └── ExtensionApp.tsx
│   ├── hooks/             # Custom React hooks
│   ├── lib/               # Utilities and API client
│   ├── pages/             # Web app pages
│   ├── App.tsx            # Main app component
│   └── main.tsx           # Web app entry point
├── public/
│   ├── manifest.json      # Extension manifest
│   ├── background.js      # Extension background script
│   └── extension-popup.html
├── vite.config.ts         # Web app config
├── vite.config.extension.ts  # Extension config
├── API_INTEGRATION.md     # API specifications
├── EXTENSION_BUILD.md     # Extension build guide
└── SETUP_GUIDE.md         # This file
```

## Support & Resources

- **API Documentation**: See `API_INTEGRATION.md`
- **Extension Build**: See `EXTENSION_BUILD.md`
- **React**: https://react.dev/
- **Vite**: https://vitejs.dev/
- **Tailwind CSS**: https://tailwindcss.com/
- **Shadcn UI**: https://ui.shadcn.com/

---

## Quick Start Checklist

- [ ] Node.js installed
- [ ] Dependencies installed (`npm install`)
- [ ] `.env` file created with `VITE_API_BASE_URL`
- [ ] Backend API running on port 5000
- [ ] MongoDB running
- [ ] Web app started (`npm run dev`)
- [ ] Extension built (`npm run build:extension`)
- [ ] Extension loaded in Chrome
- [ ] Test registration with OTP
- [ ] Test login
- [ ] Test extension features

---

**Need Help?** Check the troubleshooting section or create an issue in the repository.
