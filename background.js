// Parent Buddy - Minimal Extension
// Only does 3 things:
// 1. Reports all open tabs to backend
// 2. Asks backend "allow or block?" for each page
// 3. Shows block overlay if backend says block

let BACKEND_URL = '';
let DEVICE_ID = 'chromebook';

// Load config
chrome.storage.local.get(['backendUrl', 'deviceId'], (result) => {
  BACKEND_URL = result.backendUrl || '';
  DEVICE_ID = result.deviceId || 'chromebook';
  console.log('[ParentBuddy] Loaded config:', BACKEND_URL, DEVICE_ID);
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.backendUrl) BACKEND_URL = changes.backendUrl.newValue || '';
  if (changes.deviceId) DEVICE_ID = changes.deviceId.newValue || 'chromebook';
  console.log('[ParentBuddy] Config changed:', BACKEND_URL, DEVICE_ID);
});

// Skip internal URLs
function isInternal(url) {
  return !url || url.startsWith('chrome') || url.startsWith('about') || url.startsWith('edge') || url.startsWith('brave');
}

// === REPORT TABS ===
// Send all tabs to backend every 3 seconds
setInterval(async () => {
  if (!BACKEND_URL) return;
  try {
    const tabs = await chrome.tabs.query({});
    const data = tabs.filter(t => !isInternal(t.url)).map(t => ({
      id: t.id, url: t.url, title: t.title, active: t.active
    }));
    await fetch(`${BACKEND_URL}/api/tabs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: DEVICE_ID, tabs: data })
    });
  } catch (e) {
    console.log('[ParentBuddy] Tab sync error:', e.message);
  }
}, 3000);

// === CHECK & BLOCK ===
// On every page load, ask backend if allowed
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;

  if (!BACKEND_URL) {
    console.log('[ParentBuddy] No backend URL configured, allowing page');
    return;
  }

  try {
    const tab = await chrome.tabs.get(details.tabId);
    if (!tab || isInternal(tab.url)) return;

    console.log('[ParentBuddy] Checking:', tab.url);

    const res = await fetch(`${BACKEND_URL}/api/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: DEVICE_ID, url: tab.url, title: tab.title })
    });

    const result = await res.json();
    console.log('[ParentBuddy] Result:', result);

    if (result.allowed === false) {
      console.log('[ParentBuddy] BLOCKING:', tab.url, 'Reason:', result.reason);
      chrome.tabs.update(details.tabId, {
        url: chrome.runtime.getURL(`blocked.html?reason=${encodeURIComponent(result.reason || 'Blocked')}`)
      });
    }
  } catch (e) {
    // If backend error, ALLOW the page (don't block on errors)
    console.log('[ParentBuddy] Error checking page, allowing:', e.message);
  }
});

// YouTube content script handler
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'VIDEO_DATA' && BACKEND_URL) {
    console.log('[ParentBuddy] Checking video:', msg.data.title);
    fetch(`${BACKEND_URL}/api/video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: DEVICE_ID, ...msg.data })
    }).then(r => r.json()).then(result => {
      console.log('[ParentBuddy] Video result:', result);
      if (result.allowed === false && sender.tab) {
        chrome.tabs.update(sender.tab.id, {
          url: chrome.runtime.getURL(`blocked.html?reason=${encodeURIComponent(result.reason || 'Video blocked')}`)
        });
      }
    }).catch((e) => {
      console.log('[ParentBuddy] Video check error, allowing:', e.message);
    });
  }
});

console.log('[ParentBuddy] Extension loaded');
