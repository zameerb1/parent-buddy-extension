const express = require('express');
const router = express.Router();
const db = require('../db.js');

/**
 * GET /api/status
 * Returns current internet status for a device
 * Query param: deviceId
 * Response: { internetAllowed, expiresAt, message }
 */
router.get('/', (req, res) => {
  try {
    const { deviceId } = req.query;

    if (!deviceId) {
      return res.status(400).json({
        error: 'Missing required parameter: deviceId'
      });
    }

    // Get rules from database (creates default if not exists)
    const rules = db.getRules(deviceId);

    const now = Date.now();
    let internetAllowed = rules.internetAllowed;
    let expiresAt = rules.internetExpiresAt;
    let message = '';

    // Check if internet time has expired
    if (internetAllowed && expiresAt && expiresAt <= now) {
      internetAllowed = false;
      // Update the database to reflect expired status
      db.updateRules(deviceId, { internetAllowed: false });
    }

    // Calculate remaining time for message
    if (internetAllowed && expiresAt) {
      const remainingMs = expiresAt - now;
      const remainingMinutes = Math.ceil(remainingMs / 60000);

      if (remainingMinutes <= 0) {
        message = 'Time expired';
        internetAllowed = false;
      } else if (remainingMinutes === 1) {
        message = '1 minute remaining';
      } else if (remainingMinutes < 60) {
        message = `${remainingMinutes} minutes remaining`;
      } else {
        const hours = Math.floor(remainingMinutes / 60);
        const mins = remainingMinutes % 60;
        if (mins === 0) {
          message = `${hours} hour${hours > 1 ? 's' : ''} remaining`;
        } else {
          message = `${hours} hour${hours > 1 ? 's' : ''} ${mins} minute${mins > 1 ? 's' : ''} remaining`;
        }
      }
    } else if (internetAllowed) {
      message = 'Internet access enabled (no time limit)';
    } else {
      message = 'Internet access disabled';
    }

    res.json({
      internetAllowed,
      expiresAt: expiresAt || null,
      message
    });

  } catch (error) {
    console.error('Error in /api/status:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

module.exports = router;
