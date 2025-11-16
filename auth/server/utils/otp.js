const crypto = require('crypto');

// Generate 6-digit OTP
exports.generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

// OTP expires in 10 minutes
exports.getOTPExpiry = () => {
  return new Date(Date.now() + 10 * 60 * 1000);
};

// Verify OTP
exports.verifyOTP = (storedOTP, inputOTP, expiresAt) => {
  if (!storedOTP || !expiresAt) {
    return { valid: false, message: 'OTP not found' };
  }

  if (new Date() > new Date(expiresAt)) {
    return { valid: false, message: 'OTP has expired' };
  }

  if (storedOTP !== inputOTP) {
    return { valid: false, message: 'Invalid OTP' };
  }

  return { valid: true, message: 'OTP verified successfully' };
};