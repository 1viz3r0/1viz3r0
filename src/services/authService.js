/**
 * Auth Service
 * 
 * Business logic for authentication operations
 * Extracted from auth/server/routes/auth.js
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Session = require('../models/Session');
const { generateOTP, getOTPExpiry, verifyOTP } = require('../utils/otp');
const { sendEmail } = require('../utils/mailer');
const { sendSMS, verifySMS } = require('../utils/sms');
const { validateEmail, validatePassword, validatePhone } = require('../utils/validation');

/**
 * Generate JWT token
 * @param {string} userId - User ID
 * @returns {string} JWT token
 */
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

/**
 * Register a new user - initiates OTP verification flow
 * @param {Object} userData - { name, email, phone, password }
 * @returns {Promise<Object>} { success, sessionId, requiresOTP, message, devEmailOTP? }
 */
exports.register = async (userData) => {
  const { name, email, phone, password } = userData;

  // Validate inputs
  const emailValidation = validateEmail(email);
  if (!emailValidation.valid) {
    throw new Error(emailValidation.message);
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    throw new Error(passwordValidation.message);
  }

  const phoneValidation = validatePhone(phone);
  if (!phoneValidation.valid) {
    throw new Error(phoneValidation.message);
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new Error('Email already registered');
  }

  // Generate session ID
  const sessionId = crypto.randomBytes(32).toString('hex');

  // Generate OTP for email
  const emailOTP = generateOTP();

  // Create session with user data
  await Session.create({
    sessionId,
    userData: { name, email, phone, password },
    emailOTP: {
      code: emailOTP,
      expiresAt: getOTPExpiry(),
      verified: false,
      attempts: 0
    },
    mobileOTP: {
      verified: false,
      attempts: 0
    }
  });

  // Send OTPs
  const emailResult = await sendEmail(email, emailOTP);
  const smsResult = await sendSMS(phone);

  // Log results
  if (!emailResult.success) {
    console.error('❌ Email sending failed:', emailResult.error);
    if (process.env.NODE_ENV === 'development') {
      console.log('📧 [DEV MODE] Email OTP for', email, ':', emailOTP);
    }
  } else {
    console.log('✅ Email sent successfully:', emailResult.messageId);
  }

  if (!smsResult.success) {
    console.error('❌ SMS sending failed:', smsResult.error);
  } else {
    console.log('✅ SMS sent successfully:', smsResult.sid || 'dev-mode');
  }

  // If email failed, throw error (unless in dev mode with placeholder)
  if (!emailResult.success && !emailResult.devOTP) {
    throw new Error('Failed to send email OTP. Please check your email configuration or try again.');
  }

  const result = {
    success: true,
    sessionId,
    requiresOTP: true,
    message: 'OTPs sent to email and phone'
  };

  // In development, include OTPs for testing
  if (process.env.NODE_ENV === 'development') {
    result.devEmailOTP = emailResult.devOTP || emailOTP;
  }

  return result;
};

/**
 * Verify email OTP during registration
 * @param {string} sessionId - Session ID
 * @param {string} otp - OTP code
 * @returns {Promise<Object>} { success, message }
 */
exports.verifyEmailOTP = async (sessionId, otp) => {
  if (!sessionId || !otp) {
    throw new Error('Session ID and OTP required');
  }

  const session = await Session.findOne({ sessionId });
  if (!session) {
    throw new Error('Session not found or expired');
  }

  // Check attempts
  if (session.emailOTP.attempts >= 5) {
    throw new Error('Too many attempts. Please request a new OTP.');
  }

  // Verify OTP
  const verification = verifyOTP(session.emailOTP.code, otp, session.emailOTP.expiresAt);
  
  if (!verification.valid) {
    session.emailOTP.attempts += 1;
    await session.save();
    console.log('❌ Email OTP verification failed:', verification.message, 'Attempts:', session.emailOTP.attempts);
    throw new Error(verification.message);
  }

  // Mark email as verified
  session.emailOTP.verified = true;
  await session.save();

  console.log('✅ Email OTP verified successfully for session:', sessionId);

  return {
    success: true,
    message: 'Email verified successfully'
  };
};

/**
 * Verify mobile OTP and complete registration
 * @param {string} sessionId - Session ID
 * @param {string} otp - OTP code
 * @returns {Promise<Object>} { success, user, token }
 */
exports.verifyMobileOTP = async (sessionId, otp) => {
  if (!sessionId || !otp) {
    throw new Error('Session ID and OTP required');
  }

  const session = await Session.findOne({ sessionId });
  if (!session) {
    throw new Error('Session not found or expired');
  }

  // Check if email was verified first
  if (!session.emailOTP.verified) {
    throw new Error('Please verify email first');
  }

  // Verify OTP using SMS service
  const phone = session.userData.phone;
  console.log('🔍 Verifying mobile OTP for phone:', phone, 'Session:', sessionId);
  const smsVerification = await verifySMS(phone, otp);
  console.log('📱 SMS verification result:', smsVerification);
  
  if (!smsVerification.success) {
    console.error('❌ Mobile OTP verification failed:', smsVerification.error);
    throw new Error(smsVerification.error || 'Failed to verify OTP');
  }
  
  if (!smsVerification.valid) {
    console.error('❌ Mobile OTP is invalid');
    throw new Error('Invalid verification code. Please try again.');
  }
  
  console.log('✅ Mobile OTP verified successfully');

  // Create user
  const user = await User.create({
    name: session.userData.name,
    email: session.userData.email,
    phone: session.userData.phone,
    password: session.userData.password,
    isEmailVerified: true,
    isPhoneVerified: true
  });

  // Delete session
  await Session.deleteOne({ sessionId });

  // Generate token
  const token = generateToken(user._id);

  return {
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone
    }
  };
};

/**
 * Resend OTP (email or mobile)
 * @param {string} sessionId - Session ID
 * @param {string} type - 'email' or 'mobile'
 * @returns {Promise<Object>} { success, message, devOTP? }
 */
exports.resendOTP = async (sessionId, type) => {
  if (!sessionId || !type) {
    throw new Error('Session ID and type required');
  }

  if (!['email', 'mobile'].includes(type)) {
    throw new Error('Invalid type. Must be "email" or "mobile"');
  }

  const session = await Session.findOne({ sessionId });
  if (!session) {
    throw new Error('Session not found or expired');
  }

  // Generate new OTP
  const newOTP = generateOTP();

  if (type === 'email') {
    session.emailOTP = {
      code: newOTP,
      expiresAt: getOTPExpiry(),
      verified: false,
      attempts: 0
    };
    await session.save();
    
    const emailResult = await sendEmail(session.userData.email, newOTP);
    
    if (!emailResult.success && !emailResult.devOTP) {
      console.error('❌ Email resend failed:', emailResult.error);
      if (process.env.NODE_ENV === 'development') {
        console.log('📧 [DEV MODE] Resend Email OTP for', session.userData.email, ':', newOTP);
      }
      throw new Error('Failed to send email OTP. Please check your email configuration.');
    }
    
    console.log('✅ Email OTP resent successfully');
    
    const result = {
      success: true,
      message: 'New OTP sent to email'
    };
    
    if (process.env.NODE_ENV === 'development') {
      result.devOTP = emailResult.devOTP || newOTP;
    }
    
    return result;
  } else {
    // For mobile, use SMS service
    if (!session.mobileOTP) {
      session.mobileOTP = {
        verified: false,
        attempts: 0
      };
    }
    await session.save();
    
    const smsResult = await sendSMS(session.userData.phone);
    
    if (!smsResult.success) {
      console.error('❌ SMS resend failed:', smsResult.error);
      throw new Error('Failed to send SMS OTP. Please check your SMS configuration.');
    }
    
    console.log('✅ SMS OTP resent successfully');
    
    return {
      success: true,
      message: 'New OTP sent to phone'
    };
  }
};

/**
 * Login user with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} { success, token, user }
 */
exports.login = async (email, password) => {
  // Validate
  const emailValidation = validateEmail(email);
  if (!emailValidation.valid) {
    throw new Error(emailValidation.message);
  }

  if (!password) {
    throw new Error('Password is required');
  }

  // Find user (include password field)
  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    throw new Error('Invalid credentials');
  }

  // Check password
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new Error('Invalid credentials');
  }

  // Generate token
  const token = generateToken(user._id);

  return {
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      twoFactorEnabled: user.twoFactorEnabled
    }
  };
};

/**
 * Request password reset
 * @param {string} email - User email
 * @returns {Promise<Object>} { success, message }
 */
exports.requestPasswordReset = async (email) => {
  const emailValidation = validateEmail(email);
  if (!emailValidation.valid) {
    throw new Error(emailValidation.message);
  }

  const user = await User.findOne({ email });
  if (!user) {
    // Don't reveal if email exists
    console.log('Password reset requested for non-existent email:', email);
    return {
      success: true,
      message: 'If an account exists for this email, you will receive a password reset link'
    };
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
  
  // Save token and expiry (expires in 1 hour)
  user.passwordResetToken = resetTokenHash;
  user.passwordResetExpiry = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();

  // Send email with reset link
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  const emailResult = await sendEmail(
    user.email,
    null,
    'Password Reset',
    `<p>Click <a href="${resetUrl}">here</a> to reset your password. Link expires in 1 hour.</p>`
  );

  if (!emailResult.success) {
    console.error('Failed to send password reset email:', emailResult.error);
    throw new Error('Failed to send password reset email');
  }

  console.log('✅ Password reset email sent to:', user.email);

  return {
    success: true,
    message: 'Password reset link sent to your email'
  };
};

/**
 * Reset password with token
 * @param {string} token - Reset token
 * @param {string} newPassword - New password
 * @returns {Promise<Object>} { success, message }
 */
exports.resetPassword = async (token, newPassword) => {
  if (!token || !newPassword) {
    throw new Error('Reset token and new password required');
  }

  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.valid) {
    throw new Error(passwordValidation.message);
  }

  // Hash token to find user
  const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
  
  const user = await User.findOne({
    passwordResetToken: resetTokenHash,
    passwordResetExpiry: { $gt: Date.now() }
  });

  if (!user) {
    throw new Error('Invalid or expired reset token');
  }

  // Update password
  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpiry = undefined;
  await user.save();

  console.log('✅ Password reset successfully for user:', user.email);

  return {
    success: true,
    message: 'Password reset successfully'
  };
};

/**
 * Update user profile
 * @param {string} userId - User ID
 * @param {Object} updateData - { name, email, phone }
 * @returns {Promise<Object>} { success, user }
 */
exports.updateProfile = async (userId, updateData) => {
  const { name, email, phone } = updateData;
  
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  // Validate and update name
  if (name !== undefined) {
    if (!name || name.trim().length < 2) {
      throw new Error('Name must be at least 2 characters');
    }
    if (name.length > 100) {
      throw new Error('Name cannot exceed 100 characters');
    }
    user.name = name.trim();
  }

  // Validate and update email
  if (email !== undefined) {
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      throw new Error(emailValidation.message);
    }
    // Check if email is already taken by another user
    const existingUser = await User.findOne({ email, _id: { $ne: userId } });
    if (existingUser) {
      throw new Error('Email already in use');
    }
    user.email = email.toLowerCase().trim();
  }

  // Validate and update phone
  if (phone !== undefined) {
    if (phone) {
      const phoneValidation = validatePhone(phone);
      if (!phoneValidation.valid) {
        throw new Error(phoneValidation.message);
      }
      user.phone = phone.trim();
    } else {
      // Allow clearing phone number
      user.phone = phone;
    }
  }

  await user.save();

  return {
    success: true,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone
    }
  };
};

/**
 * Get user profile
 * @param {string} userId - User ID
 * @returns {Promise<Object>} user data
 */
exports.getUserProfile = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    isEmailVerified: user.isEmailVerified,
    isPhoneVerified: user.isPhoneVerified,
    twoFactorEnabled: user.twoFactorEnabled,
    createdAt: user.createdAt
  };
};

/**
 * Delete user account
 * @param {string} userId - User ID
 * @returns {Promise<Object>} { success, message }
 */
exports.deleteAccount = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  // Delete all sessions for this user
  try {
    await Session.deleteMany({ userId });
    console.log(`🗑️ Deleted sessions for user ${userId}`);
  } catch (sessionError) {
    console.error('Error deleting sessions:', sessionError);
  }

  // Delete the user account
  await User.findByIdAndDelete(userId);
  console.log(`🗑️ Deleted user account ${userId}`);

  return {
    success: true,
    message: 'Account deleted successfully'
  };
};

module.exports = exports;
