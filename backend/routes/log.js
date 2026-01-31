const express = require('express');
const router = express.Router();
const db = require('../db.js');

/**
 * GET /api/log
 * Retrieve watch history for a device
 * Query params: deviceId, since (optional timestamp), limit (optional)
 */
router.get('/', (req, res) => {
  try {
    const { deviceId, since, limit = 100 } = req.query;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: deviceId'
      });
    }

    const sinceTimestamp = since ? parseInt(since, 10) : null;
    const history = db.getWatchHistory(deviceId, sinceTimestamp, parseInt(limit, 10));

    res.json({
      success: true,
      history,
      count: history.length
    });

  } catch (error) {
    console.error('Error in GET /api/log:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/log/stats
 * Get watch statistics for a device
 * Query params: deviceId, since (optional timestamp)
 */
router.get('/stats', (req, res) => {
  try {
    const { deviceId, since } = req.query;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: deviceId'
      });
    }

    const sinceTimestamp = since ? parseInt(since, 10) : null;
    const stats = db.getWatchStats(deviceId, sinceTimestamp);

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Error in GET /api/log/stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;
