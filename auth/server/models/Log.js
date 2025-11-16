const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['pages', 'downloads', 'network', 'passwords'],
    required: true
  },
  result: {
    type: String,
    enum: ['safe', 'unsafe', 'clean', 'infected', 'weak', 'strong', 'medium'],
    required: true
  },
  threatLevel: {
    type: String,
    enum: ['critical', 'high', 'medium', 'low', 'none'],
    default: 'none'
  },
  source: {
    type: String,
    required: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for faster queries
logSchema.index({ userId: 1, type: 1, timestamp: -1 });

module.exports = mongoose.model('Log', logSchema);