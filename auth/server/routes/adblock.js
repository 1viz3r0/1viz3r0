const express = require('express');
const { protect } = require('../middleware/auth');

const router = express.Router();

// POST /api/adblock/toggle
router.post('/toggle', protect, async (req, res, next) => {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Enabled status required' });
    }

    // In a real implementation, you would:
    // 1. Update user preferences in database
    // 2. Sync with extension via websocket or polling
    // 3. Update ad blocking rules

    console.log(`Ad blocker ${enabled ? 'enabled' : 'disabled'} for user ${req.user._id}`);

    res.status(200).json({
      success: true,
      enabled,
      message: `Ad blocker ${enabled ? 'enabled' : 'disabled'}`
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;