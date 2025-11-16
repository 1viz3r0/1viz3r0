const mongoose = require('mongoose');

const passwordSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  site: {
    type: String,
    required: true
  },
  username: String,
  encryptedPassword: {
    type: String,
    required: true
  },
  strength: {
    type: String,
    enum: ['weak', 'medium', 'strong'],
    required: true
  },
  lastChecked: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Password', passwordSchema);