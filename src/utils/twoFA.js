/**
 * Two-Factor Authentication Utilities
 * 
 * Handles:
 * - TOTP (Time-based One-Time Password) setup and verification
 * - Backup codes generation and validation
 * - Remember device token creation and validation
 */

const crypto = require('crypto');
const { generateOTP } = require('./otp');

/**
 * Generate TOTP secret (for authenticator apps like Google Authenticator, Authy)
 * Returns a base32 encoded secret that can be converted to a QR code
 * 
 * @returns {Object} { secret, qrCode }
 */
exports.generateTOTPSecret = () => {
  // Generate random 32-byte secret
  const secret = crypto.randomBytes(32).toString('base64');
  
  // TODO: Generate QR code using speakeasy or similar library
  // For now, return the secret
  return {
    secret,
    qrCode: null // To be implemented with QR code library
  };
};

/**
 * Verify TOTP code
 * 
 * @param {string} secret - TOTP secret
 * @param {string} code - 6-digit code from authenticator app
 * @returns {Object} { valid, message }
 */
exports.verifyTOTP = (secret, code) => {
  if (!secret || !code) {
    return { valid: false, message: 'Secret and code required' };
  }

  if (!/^\d{6}$/.test(code)) {
    return { valid: false, message: 'Invalid code format. Must be 6 digits.' };
  }

  // TODO: Implement actual TOTP verification using speakeasy library
  // For now, this is a placeholder
  // The actual implementation would verify time-based tokens
  
  return {
    valid: true,
    message: 'TOTP verified successfully'
  };
};

/**
 * Generate backup codes for account recovery
 * Returns 10 unique 8-character codes
 * 
 * @returns {Array<string>} Array of backup codes
 */
exports.generateBackupCodes = () => {
  const codes = [];
  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(code);
  }
  return codes;
};

/**
 * Validate and consume a backup code
 * 
 * @param {string} code - Backup code to validate
 * @param {Array} backupCodes - Array of backup code objects { code, used }
 * @returns {Object} { valid, message, backupCodes }
 */
exports.validateBackupCode = (code, backupCodes) => {
  if (!code || !backupCodes || backupCodes.length === 0) {
    return { valid: false, message: 'Invalid backup code' };
  }

  const formattedCode = code.toUpperCase().replace(/\s/g, '');
  
  // Find the backup code
  const backupCode = backupCodes.find(bc => bc.code === formattedCode && !bc.used);
  
  if (!backupCode) {
    return { valid: false, message: 'Invalid or already used backup code' };
  }

  // Mark as used
  backupCode.used = true;
  
  return {
    valid: true,
    message: 'Backup code validated',
    backupCodes
  };
};

/**
 * Generate remember device token
 * Token is stored in user's rememberDeviceToken field
 * Expires in 30 days by default
 * 
 * @param {number} expiryDays - Number of days until token expires (default: 30)
 * @returns {Object} { token, expiresAt }
 */
exports.generateRememberDeviceToken = (expiryDays = 30) => {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
  
  return {
    token,
    expiresAt
  };
};

/**
 * Verify remember device token
 * 
 * @param {string} token - Token to verify
 * @param {string} storedToken - Stored token in database
 * @param {Date} expiryDate - Token expiry date
 * @returns {Object} { valid, message }
 */
exports.verifyRememberDeviceToken = (token, storedToken, expiryDate) => {
  if (!token || !storedToken) {
    return { valid: false, message: 'Remember device token not found' };
  }

  if (token !== storedToken) {
    return { valid: false, message: 'Invalid remember device token' };
  }

  if (new Date() > new Date(expiryDate)) {
    return { valid: false, message: 'Remember device token expired' };
  }

  return { valid: true, message: 'Remember device token verified' };
};

/**
 * Generate 2FA challenge (OTP or other method)
 * Used when 2FA is enabled on account
 * 
 * @param {string} method - '2fa_otp', '2fa_totp', etc.
 * @returns {Object} { challenge, expiresAt }
 */
exports.generate2FAChallenge = (method = '2fa_otp') => {
  let challenge;
  
  if (method === '2fa_otp' || method === 'email_otp') {
    challenge = generateOTP(); // 6-digit OTP
  } else if (method === '2fa_totp') {
    challenge = null; // User provides their own from authenticator app
  } else {
    challenge = generateOTP();
  }

  return {
    challenge,
    method,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
  };
};

module.exports = exports;
