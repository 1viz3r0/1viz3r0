/**
 * Session Model
 * 
 * Extracted from auth/server/models/Session.js
 * Mongoose schema for OTP verification sessions during registration
 * 
 * TODO: Ensure MongoDB connection is configured in main app
 */

const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  userData: {
    name: String,
    email: String,
    phone: String,
    password: String,
    googleId: String,
    userId: String // For existing user updates
  },
  emailOTP: {
    code: String,
    expiresAt: Date,
    verified: Boolean,
    attempts: { type: Number, default: 0 }
  },
  mobileOTP: {
    code: String,
    expiresAt: Date,
    verified: Boolean,
    attempts: { type: Number, default: 0 }
  },
  existingUser: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 1800 // Session expires after 30 minutes
  }
});

module.exports = mongoose.model('Session', sessionSchema);

