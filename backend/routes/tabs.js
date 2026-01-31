const express = require('express');
const router = express.Router();

// In-memory storage for tabs (per device)
const deviceTabs = new Map();
const lastUpdate = new Map();

// Blocked URLs/domains
const blockedUrls = new Map(); // url -> { url, title, blockedAt }
const pendingBlocks = new Map(); // deviceId -> [{ tabId, url }]

// POST /api/tabs - receive tab updates from extension
router.post('/', (req, res) => {
  const { deviceId, tabs } = req.body;

  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId required' });
  }

  deviceTabs.set(deviceId, tabs || []);
  lastUpdate.set(deviceId, Date.now());

  console.log(`[Tabs] ${deviceId}: ${tabs?.length || 0} tabs`);

  res.json({ success: true });
});

// GET /api/tabs - get tabs for dashboard
router.get('/', (req, res) => {
  const { deviceId } = req.query;

  if (deviceId) {
    // Get tabs for specific device
    const tabs = deviceTabs.get(deviceId) || [];
    const updated = lastUpdate.get(deviceId) || null;
    return res.json({ deviceId, tabs, lastUpdate: updated });
  }

  // Get all devices and their tabs
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

// POST /api/tabs/block - block a tab/URL
router.post('/block', (req, res) => {
  const { deviceId, tabId, url, title } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'url required' });
  }

  // Add to blocked list
  blockedUrls.set(url, { url, title, blockedAt: Date.now() });

  // Add to pending blocks for the device
  if (deviceId && tabId) {
    const pending = pendingBlocks.get(deviceId) || [];
    pending.push({ tabId, url });
    pendingBlocks.set(deviceId, pending);
  }

  console.log(`[Tabs] Blocked: ${url}`);
  res.json({ success: true, blocked: url });
});

// POST /api/tabs/unblock - unblock a URL
router.post('/unblock', (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'url required' });
  }

  blockedUrls.delete(url);
  console.log(`[Tabs] Unblocked: ${url}`);
  res.json({ success: true, unblocked: url });
});

// GET /api/tabs/blocked - get list of blocked URLs
router.get('/blocked', (req, res) => {
  const blocked = Array.from(blockedUrls.values());
  res.json({ blocked });
});

// GET /api/tabs/pending - get pending block commands for a device (called by extension)
router.get('/pending', (req, res) => {
  const { deviceId } = req.query;

  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId required' });
  }

  const pending = pendingBlocks.get(deviceId) || [];
  const blockedList = Array.from(blockedUrls.keys());

  // Clear pending after sending
  pendingBlocks.set(deviceId, []);

  res.json({ pending, blockedUrls: blockedList });
});

module.exports = router;
