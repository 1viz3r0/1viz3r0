const express = require('express');
const { protect } = require('../middleware/auth');
const Log = require('../models/log');
const { performSpeedTest } = require('../services/networkSpeed');

const router = express.Router();

// GET /api/network/check
router.get('/check', protect, async (req, res, next) => {
  try {
    console.log('Performing network speed test...');

    const results = await performSpeedTest();

    // Log the test
    await Log.create({
      userId: req.user._id,
      type: 'network',
      result: 'safe',
      threatLevel: 'none',
      source: 'speed_test',
      details: results
    });

    res.status(200).json({
      success: true,
      ...results
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;