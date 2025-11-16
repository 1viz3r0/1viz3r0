const express = require('express');
const { protect } = require('../middleware/auth');
const Password = require('../models/Password');
const Log = require('../models/log');

const router = express.Router();

// Helper function to check password strength
const checkPasswordStrength = (password) => {
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  const length = password.length;

  const criteriaMet = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChars].filter(Boolean).length;

  if (length >= 12 && criteriaMet >= 3) return 'strong';
  if (length >= 8 && criteriaMet >= 2) return 'medium';
  return 'weak';
};

// GET /api/passwords/check
router.get('/check', protect, async (req, res, next) => {
  try {
    // Get all passwords for user
    const passwords = await Password.find({ userId: req.user._id });

    // Count by strength
    const counts = {
      weak: 0,
      medium: 0,
      strong: 0
    };

    passwords.forEach(pwd => {
      counts[pwd.strength]++;
    });

    // Log the check
    await Log.create({
      userId: req.user._id,
      type: 'passwords',
      result: counts.weak > 0 ? 'weak' : 'strong',
      threatLevel: counts.weak > 0 ? 'medium' : 'none',
      source: 'password_check',
      details: counts
    });

    res.status(200).json({
      success: true,
      ...counts,
      passwords: passwords.map(pwd => ({
        site: pwd.site,
        strength: pwd.strength
      }))
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;