const express = require('express');
const router = express.Router();
const db = require('../db.js');
const blockedSites = require('../blockedSites.js');

/**
 * POST /api/check
 * Check if a page should be allowed
 * Backend is the SINGLE SOURCE OF TRUTH
 */
router.post('/', (req, res) => {
  try {
    const { deviceId, url, title } = req.body;

    if (!deviceId || !url) {
      return res.json({ allowed: false, reason: 'Invalid request' });
    }

    // 1. Check if site is manually blocked from dashboard
    if (blockedSites.isBlocked(url)) {
      return res.json({
        allowed: false,
        reason: `Blocked by parent: ${blockedSites.getDomain(url)}`
      });
    }

    // 2. Check device rules (internet on/off, time limits)
    const rules = db.getRules(deviceId);
    const now = Date.now();
    let internetAllowed = rules.internetAllowed;

    // Check if time expired
    if (internetAllowed && rules.internetExpiresAt && rules.internetExpiresAt <= now) {
      internetAllowed = false;
      db.updateRules(deviceId, { internetAllowed: false });
    }

    if (!internetAllowed) {
      const reason = rules.internetExpiresAt && rules.internetExpiresAt <= now
        ? 'Internet time has expired'
        : 'Internet access disabled';
      return res.json({ allowed: false, reason });
    }

    // 3. Allowed
    res.json({ allowed: true });

  } catch (error) {
    console.error('Error in /api/check:', error);
    res.json({ allowed: false, reason: 'Server error' });
  }
});

module.exports = router;
