// Config - will be set from popup
let BACKEND_URL = '';
let DEVICE_ID = 'default';

// Load config from storage
chrome.storage.local.get(['backendUrl', 'deviceId'], (result) => {
  BACKEND_URL = result.backendUrl || '';
  DEVICE_ID = result.deviceId || 'default';
  console.log('[ParentBuddy] Config loaded:', { BACKEND_URL, DEVICE_ID });
  if (BACKEND_URL) syncStatus();
});

// Listen for config changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    if (changes.backendUrl) {
      BACKEND_URL = changes.backendUrl.newValue || '';
      console.log('[ParentBuddy] Backend URL updated:', BACKEND_URL);
    }
    if (changes.deviceId) {
      DEVICE_ID = changes.deviceId.newValue || 'default';
    }
    if (BACKEND_URL) syncStatus();
  }
});

// Current status from backend
let currentStatus = { internetAllowed: false };

// URLs to skip (never check these)
function shouldSkipUrl(url) {
  if (!url) return true;
  if (url.startsWith('chrome://')) return true;
  if (url.startsWith('chrome-extension://')) return true;
  if (url.startsWith('about:')) return true;
  if (url.startsWith('edge://')) return true;
  if (url.startsWith('brave://')) return true;
  if (url === 'about:blank') return true;
  return false;
}

// Poll backend every 30 seconds
chrome.alarms.create('syncStatus', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'syncStatus') await syncStatus();
});

async function syncStatus() {
  if (!BACKEND_URL) return;
  try {
    const res = await fetch(`${BACKEND_URL}/api/status?deviceId=${DEVICE_ID}`);
    if (res.ok) {
      currentStatus = await res.json();
      console.log('[ParentBuddy] Status synced:', currentStatus);
    }
  } catch (e) {
    console.error('[ParentBuddy] Status sync failed:', e.message);
    currentStatus = { internetAllowed: false }; // Fail-safe: block if backend unreachable
  }
}

// Check page on navigation
chrome.webNavigation.onCompleted.addListener(async (details) => {
  // Main frame only
  if (details.frameId !== 0) return;
  if (!BACKEND_URL) return;

  const url = details.url;

  // Skip internal/extension URLs
  if (shouldSkipUrl(url)) return;

  try {
    const tab = await chrome.tabs.get(details.tabId);
    if (!tab || shouldSkipUrl(tab.url)) return;

    console.log('[ParentBuddy] Checking page:', tab.url);
    const result = await checkPage(tab.url, tab.title || '');

    if (!result.allowed) {
      console.log('[ParentBuddy] Blocking page:', tab.url, 'Reason:', result.reason);
      chrome.tabs.update(details.tabId, {
        url: chrome.runtime.getURL(`blocked.html?reason=${encodeURIComponent(result.reason || 'Blocked')}`)
      });
    }
  } catch (e) {
    console.error('[ParentBuddy] Error checking page:', e.message);
  }
});

async function checkPage(url, title) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: DEVICE_ID, url, title })
    });
    if (!res.ok) {
      return { allowed: false, reason: 'Server error' };
    }
    return await res.json();
  } catch (e) {
    console.error('[ParentBuddy] checkPage error:', e.message);
    return { allowed: false, reason: 'Cannot connect to server' };
  }
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'VIDEO_DATA') {
    console.log('[ParentBuddy] Video data received:', message.data);
    checkVideo(message.data).then(result => {
      console.log('[ParentBuddy] Video check result:', result);
      if (!result.allowed && sender.tab) {
        chrome.tabs.update(sender.tab.id, {
          url: chrome.runtime.getURL(`blocked.html?reason=${encodeURIComponent(result.reason || 'Video blocked')}`)
        });
      }
    }).catch(e => {
      console.error('[ParentBuddy] Video check error:', e.message);
    });
  }
  if (message.type === 'GET_STATUS') {
    sendResponse(currentStatus);
  }
  return true;
});

async function checkVideo(videoData) {
  if (!BACKEND_URL) {
    return { allowed: false, reason: 'Extension not configured' };
  }
  try {
    const res = await fetch(`${BACKEND_URL}/api/video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: DEVICE_ID, ...videoData })
    });
    if (!res.ok) {
      return { allowed: false, reason: 'Server error' };
    }
    return await res.json();
  } catch (e) {
    console.error('[ParentBuddy] checkVideo error:', e.message);
    return { allowed: false, reason: 'Cannot connect to server' };
  }
}

console.log('[ParentBuddy] Service worker loaded');
