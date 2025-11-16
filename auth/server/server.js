/**
 * ONE-Go Security Backend Server
 * 
 * Main Express server with integrated authentication system
 * Features: Email & Phone verification, JWT auth, User management
 * Database: MongoDB
 * Entry point for API server
 */

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import routes
const authRoutes = require('../../src/routes/authRoutes');
const errorHandler = require('../../src/middleware/errorHandler');
const path = require('path');

const app = express();

// ============================================================================
// DATABASE
// ============================================================================

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ============================================================================
// SECURITY
// ============================================================================

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:8080',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:3000',
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      if (process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ============================================================================
// RATE LIMITING
// ============================================================================

const isDevelopment = process.env.NODE_ENV === 'development';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevelopment ? 1000 : 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health',
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevelopment ? 500 : 50,
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many authentication attempts, please try again later.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/', limiter);

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================================
// ROUTES
// ============================================================================

app.use('/api/auth', authRoutes);

// Serve frontend static build if present (preserve API routes)
const publicDir = path.join(__dirname, 'public');
try {
  app.use(express.static(publicDir));
  app.get('/', (req, res, next) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
} catch (err) {
  console.warn('Frontend static files not available:', err.message);
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/api/health', async (req, res) => {
  try {
    const mongoConnected = mongoose.connection.readyState === 1;
    const emailConfigured = !!process.env.EMAIL_HOST && !!process.env.EMAIL_USER;
    const smsConfigured = !!process.env.TWILIO_ACCOUNT_SID;
    
    res.json({
      status: 'ok',
      message: 'ONE-Go Security API is running',
      timestamp: new Date().toISOString(),
      services: {
        mongodb: mongoConnected ? 'connected' : 'disconnected',
        email: emailConfigured ? 'configured' : 'not configured',
        sms: smsConfigured ? 'configured' : 'not configured',
        auth: 'ready'
      },
      environment: process.env.NODE_ENV
    });
  } catch (error) {
    res.json({
      status: 'ok',
      message: 'ONE-Go Security API is running',
      services: {
        mongodb: 'unknown',
        email: 'unknown',
        sms: 'unknown',
        auth: 'ready'
      },
      error: error.message
    });
  }
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({
      success: false,
      message: `API route not found: ${req.method} ${req.originalUrl}`
    });
  } else {
    res.status(404).send('Not Found');
  }
});

app.use(errorHandler);

// ============================================================================
// START
// ============================================================================

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 ONE-Go Security Backend - Authentication System`);
  console.log(`${'='.repeat(70)}`);
  console.log(`📍 Server: http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  console.log(`${'='.repeat(70)}\n`);
  
  console.log('📋 Services:');
  console.log(`   ✅ Authentication - /api/auth/*`);
  console.log(`   ✅ Health Check - /api/health\n`);
  
  const emailConfigured = process.env.EMAIL_HOST && process.env.EMAIL_USER;
  const smsConfigured = process.env.TWILIO_ACCOUNT_SID;
  const jwtConfigured = process.env.JWT_SECRET;
  const mongoUri = process.env.MONGODB_URI;
  
  console.log('🔐 Configuration:');
  console.log(`   ${mongoUri ? '✅' : '❌'} MongoDB: ${mongoUri ? 'ready' : 'MISSING'}`);
  console.log(`   ${jwtConfigured ? '✅' : '❌'} JWT: ${jwtConfigured ? 'set' : 'MISSING'}`);
  console.log(`   ${emailConfigured ? '✅' : '⚠️'} Email: ${emailConfigured ? 'configured' : 'not configured'}`);
  console.log(`   ${smsConfigured ? '✅' : '⚠️'} SMS: ${smsConfigured ? 'configured' : 'optional'}\n`);
  
  if (!jwtConfigured || !mongoUri) {
    console.error('❌ CRITICAL: Missing required configuration');
    if (!jwtConfigured) console.error('   - JWT_SECRET');
    if (!mongoUri) console.error('   - MONGODB_URI');
    console.error('   Update .env and restart\n');
  }
});
