const express = require('express');
const router = express.Router();
const db = require('../db.js');
const sites = require('../blockedSites.js');

/**
 * POST /api/check
 * Check if a page should be allowed
 * Priority: 1. Banned (always block) 2. Blocked (temp block) 3. Internet rules
 */
router.post('/', (req, res) => {
  try {
    const { deviceId, url, title } = req.body;

    if (!deviceId || !url) {
      return res.json({ allowed: false, reason: 'Invalid request' });
    }

    // 1. Check if BANNED (permanent - always block)
    if (sites.isBanned(url)) {
      return res.json({
        allowed: false,
        reason: `Banned: ${sites.getDomain(url)}`
      });
    }

    // 2. Check if BLOCKED (temporary)
    if (sites.isBlocked(url)) {
      return res.json({
        allowed: false,
        reason: `Blocked: ${sites.getDomain(url)}`
      });
    }

    // 3. Check device rules (internet on/off, time limits)
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

    // 4. Allowed
    res.json({ allowed: true });

  } catch (error) {
    console.error('Error in /api/check:', error);
    res.json({ allowed: true }); // Allow on error
  }
});

module.exports = router;
