const express = require('express');
const router = express.Router();

// In-memory storage for tabs (per device)
const deviceTabs = new Map();
const lastUpdate = new Map();

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

module.exports = router;
