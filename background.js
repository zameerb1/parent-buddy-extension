// Config - will be set from popup
let BACKEND_URL = '';
let DEVICE_ID = 'default';

// Load config from storage
chrome.storage.local.get(['backendUrl', 'deviceId'], (result) => {
  BACKEND_URL = result.backendUrl || '';
  DEVICE_ID = result.deviceId || 'default';
});

// Listen for config changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    if (changes.backendUrl) BACKEND_URL = changes.backendUrl.newValue || '';
    if (changes.deviceId) DEVICE_ID = changes.deviceId.newValue || 'default';
  }
});

// Current status from backend
let currentStatus = { internetAllowed: false };

// Poll backend every 30 seconds
chrome.alarms.create('syncStatus', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'syncStatus') await syncStatus();
});

async function syncStatus() {
  if (!BACKEND_URL) return;
  try {
    const res = await fetch(`${BACKEND_URL}/api/status?deviceId=${DEVICE_ID}`);
    currentStatus = await res.json();
  } catch (e) {
    currentStatus = { internetAllowed: false }; // Fail-safe: block if backend unreachable
  }
}

// Check page on navigation
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return; // Main frame only
  if (!BACKEND_URL) return;

  const tab = await chrome.tabs.get(details.tabId);
  const result = await checkPage(tab.url, tab.title);

  if (!result.allowed) {
    chrome.tabs.update(details.tabId, {
      url: chrome.runtime.getURL(`blocked.html?reason=${encodeURIComponent(result.reason)}`)
    });
  }
});

async function checkPage(url, title) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: DEVICE_ID, url, title })
    });
    return res.json();
  } catch (e) {
    return { allowed: false, reason: 'Cannot connect to server' };
  }
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'VIDEO_DATA') {
    checkVideo(message.data).then(result => {
      if (!result.allowed) {
        chrome.tabs.update(sender.tab.id, {
          url: chrome.runtime.getURL(`blocked.html?reason=${encodeURIComponent(result.reason)}`)
        });
      }
    });
  }
  if (message.type === 'GET_STATUS') {
    sendResponse(currentStatus);
  }
  return true;
});

async function checkVideo(videoData) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: DEVICE_ID, ...videoData })
    });
    return res.json();
  } catch (e) {
    return { allowed: false, reason: 'Cannot connect to server' };
  }
}
