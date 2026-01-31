const express = require('express');
const router = express.Router();
const sites = require('../blockedSites.js');

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

// === BLOCK (temporary) ===
router.post('/block', (req, res) => {
  const { url, title } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  sites.block(url, title);
  res.json({ success: true, blocked: sites.getDomain(url) });
});

router.post('/unblock', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  sites.unblock(url);
  res.json({ success: true });
});

router.get('/blocked', (req, res) => {
  res.json({ blocked: sites.getBlocked() });
});

// === BAN (permanent) ===
router.post('/ban', (req, res) => {
  const { url, title } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  sites.ban(url, title);
  res.json({ success: true, banned: sites.getDomain(url) });
});

router.post('/unban', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  sites.unban(url);
  res.json({ success: true });
});

router.get('/banned', (req, res) => {
  res.json({ banned: sites.getBanned() });
});

module.exports = router;
