/**
 * Auth Routes
 * 
 * Authentication routes (register, login, password reset, 2FA, etc.)
 */

const express = require('express');
const authController = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Public routes - Registration flow
router.post('/register', authController.register);
router.post('/verify-email-otp', authController.verifyEmailOTP);
router.post('/verify-mobile-otp', authController.verifyMobileOTP);
router.post('/resend-otp', authController.resendOTP);

// Public routes - Login/Logout
router.post('/login', authController.login);
router.post('/logout', authController.logout);

// Public routes - Password reset
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// Protected routes - User profile
router.get('/me', protect, authController.getProfile);
router.put('/me', protect, authController.updateProfile);
router.delete('/account', protect, authController.deleteAccount);

// TODO: 2FA endpoints (TOTP setup, backup codes, etc.)
// router.post('/2fa/setup', protect, authController.setup2FA);
// router.post('/2fa/verify', protect, authController.verify2FA);
// router.post('/2fa/backup-codes', protect, authController.getBackupCodes);
// router.delete('/2fa/disable', protect, authController.disable2FA);

// TODO: Remember device token endpoints
// router.post('/remember-device', protect, authController.rememberDevice);
// router.get('/trusted-devices', protect, authController.getTrustedDevices);
// router.delete('/trusted-devices/:id', protect, authController.removeTrustedDevice);

module.exports = router;
