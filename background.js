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

// Poll backend every 30 seconds for status, every 5 seconds for tabs, every 3 seconds for pending blocks
chrome.alarms.create('syncStatus', { periodInMinutes: 0.5 });
chrome.alarms.create('syncTabs', { periodInMinutes: 0.083 }); // ~5 seconds
chrome.alarms.create('checkPending', { periodInMinutes: 0.05 }); // ~3 seconds
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'syncStatus') await syncStatus();
  if (alarm.name === 'syncTabs') await syncTabs();
  if (alarm.name === 'checkPending') await checkPendingBlocks();
});

// List of blocked URLs from dashboard
let blockedUrls = [];

// Check for pending block commands from dashboard
async function checkPendingBlocks() {
  if (!BACKEND_URL) return;
  try {
    const res = await fetch(`${BACKEND_URL}/api/tabs/pending?deviceId=${DEVICE_ID}`);
    if (res.ok) {
      const data = await res.json();

      // Update blocked URLs list
      blockedUrls = data.blockedUrls || [];

      // Process pending block commands (close specific tabs)
      if (data.pending && data.pending.length > 0) {
        for (const block of data.pending) {
          console.log('[ParentBuddy] Closing blocked tab:', block.tabId, block.url);
          try {
            await chrome.tabs.remove(block.tabId);
          } catch (e) {
            console.log('[ParentBuddy] Tab already closed or not found');
          }
        }
      }
    }
  } catch (e) {
    console.error('[ParentBuddy] Check pending failed:', e.message);
  }
}

// Check if URL is in blocked list
function isUrlBlocked(url) {
  if (!url) return false;
  return blockedUrls.some(blockedUrl => {
    try {
      const blocked = new URL(blockedUrl);
      const check = new URL(url);
      // Match by hostname
      return check.hostname === blocked.hostname;
    } catch {
      return url.includes(blockedUrl);
    }
  });
}

// Send all open tabs to backend
async function syncTabs() {
  if (!BACKEND_URL) return;
  try {
    const tabs = await chrome.tabs.query({});
    const tabData = tabs
      .filter(tab => !shouldSkipUrl(tab.url))
      .map(tab => ({
        id: tab.id,
        url: tab.url,
        title: tab.title,
        active: tab.active,
        windowId: tab.windowId
      }));

    await fetch(`${BACKEND_URL}/api/tabs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: DEVICE_ID, tabs: tabData })
    });
    console.log('[ParentBuddy] Tabs synced:', tabData.length);
  } catch (e) {
    console.error('[ParentBuddy] Tabs sync failed:', e.message);
  }
}

// Also sync tabs on tab changes
chrome.tabs.onCreated.addListener(() => syncTabs());
chrome.tabs.onRemoved.addListener(() => syncTabs());
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.title) syncTabs();
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

    // Check if URL is in dashboard-blocked list first
    if (isUrlBlocked(tab.url)) {
      console.log('[ParentBuddy] URL in blocked list:', tab.url);
      chrome.tabs.update(details.tabId, {
        url: chrome.runtime.getURL(`blocked.html?reason=${encodeURIComponent('Blocked by parent')}`)
      });
      return;
    }

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
