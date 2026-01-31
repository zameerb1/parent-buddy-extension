const express = require('express');
const router = express.Router();
const db = require('../db.js');

// Default device ID (can be extended for multi-device)
const DEFAULT_DEVICE = 'chromebook';

// GET /api/internet/status
router.get('/status', (req, res) => {
  const deviceId = req.query.deviceId || DEFAULT_DEVICE;
  const rules = db.getRules(deviceId);

  const now = Date.now();
  let internetAllowed = rules.internetAllowed;

  // Check if expired
  if (internetAllowed && rules.internetExpiresAt && rules.internetExpiresAt <= now) {
    internetAllowed = false;
    db.updateRules(deviceId, { internetAllowed: false });
  }

  res.json({
    deviceId,
    internetAllowed,
    expiresAt: rules.internetExpiresAt
  });
});

// POST /api/internet/enable
router.post('/enable', (req, res) => {
  const deviceId = req.body.deviceId || DEFAULT_DEVICE;
  const minutes = req.body.minutes; // null = unlimited

  let expiresAt = null;
  if (minutes) {
    expiresAt = Date.now() + (minutes * 60 * 1000);
  }

  db.updateRules(deviceId, {
    internetAllowed: true,
    internetExpiresAt: expiresAt
  });

  console.log(`[Internet] Enabled for ${deviceId}${minutes ? ` (${minutes} min)` : ' (unlimited)'}`);

  res.json({
    success: true,
    internetAllowed: true,
    expiresAt
  });
});

// POST /api/internet/disable
router.post('/disable', (req, res) => {
  const deviceId = req.body.deviceId || DEFAULT_DEVICE;

  db.updateRules(deviceId, {
    internetAllowed: false,
    internetExpiresAt: null
  });

  console.log(`[Internet] Disabled for ${deviceId}`);

  res.json({
    success: true,
    internetAllowed: false
  });
});

module.exports = router;
