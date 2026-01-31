const express = require('express');
const router = express.Router();
const blockedSites = require('../blockedSites.js');

// In-memory tab storage
const deviceTabs = new Map();
const lastUpdate = new Map();

// POST /api/tabs - receive tabs from extension
router.post('/', (req, res) => {
  const { deviceId, tabs } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });

  deviceTabs.set(deviceId, tabs || []);
  lastUpdate.set(deviceId, Date.now());

  res.json({ success: true });
});

// GET /api/tabs - get all tabs for dashboard
router.get('/', (req, res) => {
  const allDevices = [];
  for (const [id, tabs] of deviceTabs.entries()) {
    allDevices.push({
      deviceId: id,
      tabs,
      lastUpdate: lastUpdate.get(id)
    });
  }
  res.json({ devices: allDevices });
});

// POST /api/tabs/block - block a site
router.post('/block', (req, res) => {
  const { url, title } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  blockedSites.block(url, title);
  res.json({ success: true, blocked: blockedSites.getDomain(url) });
});

// POST /api/tabs/unblock - unblock a site
router.post('/unblock', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  blockedSites.unblock(url);
  res.json({ success: true });
});

// GET /api/tabs/blocked - get blocked sites list
router.get('/blocked', (req, res) => {
  res.json({ blocked: blockedSites.getAll() });
});

module.exports = router;
