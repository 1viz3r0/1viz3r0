const express = require('express');
const { protect } = require('../middleware/auth');
const Log = require('../models/log');
const { Parser } = require('json2csv');

const router = express.Router();

// GET /api/logs
router.get('/', protect, async (req, res, next) => {
  try {
    const { type } = req.query;

    const query = { userId: req.user._id };
    if (type && ['pages', 'downloads', 'network', 'passwords'].includes(type)) {
      query.type = type;
    }

    const logs = await Log.find(query)
      .sort({ timestamp: -1 })
      .limit(100);

    const formattedLogs = logs.map(log => ({
      id: log._id.toString(),
      timestamp: log.timestamp,
      type: log.type,
      result: log.result,
      threatLevel: log.threatLevel,
      source: log.source,
      details: log.details
    }));

    console.log(`📋 Returning ${formattedLogs.length} logs for user ${req.user._id}, type: ${type || 'all'}`);

    // Return logs in consistent format
    res.status(200).json({
      success: true,
      logs: formattedLogs
    });
  } catch (error) {
    console.error('❌ Error fetching logs:', error);
    // Return error in JSON format (not HTML)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch logs',
      error: error.message
    });
  }
});

// GET /api/logs/export
router.get('/export', protect, async (req, res, next) => {
  try {
    const { type } = req.query;

    if (!type || !['pages', 'downloads', 'network', 'passwords'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Valid type required' });
    }

    const logs = await Log.find({
      userId: req.user._id,
      type
    }).sort({ timestamp: -1 });

    // Convert to CSV
    const fields = ['timestamp', 'type', 'result', 'threatLevel', 'source'];
    const parser = new Parser({ fields });
    const csv = parser.parse(logs);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${type}-logs.csv`);
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/logs/recent - Delete logs older than 24 hours
router.delete('/recent', protect, async (req, res, next) => {
  try {
    // Delete logs older than 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const result = await Log.deleteMany({
      userId: req.user._id,
      timestamp: { $lt: oneDayAgo }
    });

    console.log(`Deleted ${result.deletedCount} old logs for user ${req.user._id}`);

    res.status(200).json({
      success: true,
      message: `Deleted ${result.deletedCount} logs`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/logs - Delete ALL logs for the user
router.delete('/', protect, async (req, res, next) => {
  try {
    // Delete ALL logs for the user (not just old ones)
    const result = await Log.deleteMany({
      userId: req.user._id
    });

    console.log(`🗑️ Deleted ALL ${result.deletedCount} logs for user ${req.user._id}`);

    res.status(200).json({
      success: true,
      message: `Deleted ${result.deletedCount} logs`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('❌ Error deleting logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete logs',
      error: error.message
    });
  }
});

module.exports = router;