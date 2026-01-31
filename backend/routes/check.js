const express = require('express');
const router = express.Router();
const db = require('../db.js');

/**
 * POST /api/check
 * Check if a page should be allowed
 * Request body: { deviceId, url, title }
 * Response: { allowed: true } or { allowed: false, reason: "..." }
 */
router.post('/', (req, res) => {
  try {
    const { deviceId, url, title } = req.body;

    if (!deviceId) {
      return res.status(400).json({
        allowed: false,
        reason: 'Missing required parameter: deviceId'
      });
    }

    if (!url) {
      return res.status(400).json({
        allowed: false,
        reason: 'Missing required parameter: url'
      });
    }

    // Get rules from database (creates default if not exists)
    const rules = db.getRules(deviceId);

    const now = Date.now();
    let internetAllowed = rules.internetAllowed;
    const expiresAt = rules.internetExpiresAt;

    // Check if internet time has expired
    if (internetAllowed && expiresAt && expiresAt <= now) {
      internetAllowed = false;
      // Update the database to reflect expired status
      db.updateRules(deviceId, { internetAllowed: false });
    }

    // Check if internet is allowed for device
    if (!internetAllowed) {
      let reason = 'Internet access is currently disabled';

      if (expiresAt && expiresAt <= now) {
        reason = 'Internet time has expired';
      }

      return res.json({
        allowed: false,
        reason
      });
    }

    // Internet is allowed
    res.json({
      allowed: true
    });

  } catch (error) {
    console.error('Error in /api/check:', error);
    res.status(500).json({
      allowed: false,
      reason: 'Internal server error'
    });
  }
});

module.exports = router;
