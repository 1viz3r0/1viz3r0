/**
 * Auth Controller
 * 
 * Request handlers for authentication routes
 */

const authService = require('../services/authService');

/**
 * Register a new user
 * POST /api/auth/register
 */
exports.register = async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;

    const result = await authService.register({ name, email, phone, password });

    res.status(200).json(result);
  } catch (error) {
    if (error.message === 'Email already registered') {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error.message.includes('Failed to send email')) {
      return res.status(500).json({
        success: false,
        message: error.message,
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
    next(error);
  }
};

/**
 * Verify email OTP during registration
 * POST /api/auth/verify-email-otp
 */
exports.verifyEmailOTP = async (req, res, next) => {
  try {
    const { sessionId, otp } = req.body;

    const result = await authService.verifyEmailOTP(sessionId, otp);

    res.status(200).json(result);
  } catch (error) {
    if (error.message === 'Session not found or expired') {
      return res.status(404).json({ success: false, message: error.message });
    }
    if (error.message === 'Too many attempts. Please request a new OTP.') {
      return res.status(429).json({ success: false, message: error.message });
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Verify mobile OTP and complete registration
 * POST /api/auth/verify-mobile-otp
 */
exports.verifyMobileOTP = async (req, res, next) => {
  try {
    const { sessionId, otp } = req.body;

    const result = await authService.verifyMobileOTP(sessionId, otp);

    res.status(201).json({
      success: true,
      ...result,
      message: 'Registration successful'
    });
  } catch (error) {
    if (error.message === 'Session not found or expired') {
      return res.status(404).json({ success: false, message: error.message });
    }
    if (error.message === 'Please verify email first') {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Resend OTP (email or mobile)
 * POST /api/auth/resend-otp
 */
exports.resendOTP = async (req, res, next) => {
  try {
    const { sessionId, type } = req.body;

    const result = await authService.resendOTP(sessionId, type);

    res.status(200).json(result);
  } catch (error) {
    if (error.message === 'Session not found or expired') {
      return res.status(404).json({ success: false, message: error.message });
    }
    if (error.message.includes('Invalid type')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error.message.includes('Failed to send')) {
      return res.status(500).json({
        success: false,
        message: error.message,
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
    next(error);
  }
};

/**
 * Login user with email and password
 * POST /api/auth/login
 */
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const result = await authService.login(email, password);

    res.status(200).json(result);
  } catch (error) {
    if (error.message === 'Invalid credentials') {
      return res.status(401).json({ success: false, message: error.message });
    }
    if (error.message.includes('Email is required') || error.message.includes('Invalid email')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Logout user
 * POST /api/auth/logout
 */
exports.logout = async (req, res) => {
  try {
    // Clear cookies
    res.clearCookie('auth_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });
    
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  }
};

/**
 * Request password reset
 * POST /api/auth/forgot-password
 */
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    const result = await authService.requestPasswordReset(email);

    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Reset password with token
 * POST /api/auth/reset-password
 */
exports.resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    const result = await authService.resetPassword(token, password);

    res.status(200).json(result);
  } catch (error) {
    if (error.message === 'Invalid or expired reset token') {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Get user profile (protected)
 * GET /api/auth/me
 */
exports.getProfile = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const user = await authService.getUserProfile(userId);

    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};

/**
 * Update user profile (protected)
 * PUT /api/auth/me
 */
exports.updateProfile = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { name, email, phone } = req.body;

    const result = await authService.updateProfile(userId, { name, email, phone });

    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Delete user account (protected)
 * DELETE /api/auth/account
 */
exports.deleteAccount = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const result = await authService.deleteAccount(userId);

    // Clear cookies
    res.clearCookie('auth_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('❌ Error deleting account:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete account',
      error: error.message
    });
  }
};

module.exports = exports;
