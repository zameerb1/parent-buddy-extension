// DOM elements
const form = document.getElementById('settingsForm');
const backendUrlInput = document.getElementById('backendUrl');
const deviceIdInput = document.getElementById('deviceId');
const messageDiv = document.getElementById('message');
const connectionDot = document.getElementById('connectionDot');
const connectionText = document.getElementById('connectionText');
const accessDot = document.getElementById('accessDot');
const accessText = document.getElementById('accessText');

// Load saved settings on popup open
document.addEventListener('DOMContentLoaded', async () => {
  const result = await chrome.storage.local.get(['backendUrl', 'deviceId']);
  if (result.backendUrl) backendUrlInput.value = result.backendUrl;
  if (result.deviceId) deviceIdInput.value = result.deviceId;

  // Check current status
  await updateStatus();
});

// Save settings
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const backendUrl = backendUrlInput.value.trim().replace(/\/$/, ''); // Remove trailing slash
  const deviceId = deviceIdInput.value.trim();

  await chrome.storage.local.set({ backendUrl, deviceId });

  showMessage('Settings saved!', 'success');

  // Update status after saving
  setTimeout(updateStatus, 500);
});

// Update connection and access status
async function updateStatus() {
  const result = await chrome.storage.local.get(['backendUrl', 'deviceId']);

  if (!result.backendUrl) {
    connectionDot.classList.remove('connected');
    connectionText.textContent = 'Not configured';
    accessDot.classList.remove('allowed');
    accessText.textContent = 'Unknown';
    return;
  }

  try {
    const deviceId = result.deviceId || 'default';
    const res = await fetch(`${result.backendUrl}/api/status?deviceId=${deviceId}`);

    if (res.ok) {
      const status = await res.json();

      connectionDot.classList.add('connected');
      connectionText.textContent = 'Connected to server';

      if (status.internetAllowed) {
        accessDot.classList.add('allowed');
        accessText.textContent = 'Allowed';
      } else {
        accessDot.classList.remove('allowed');
        accessText.textContent = 'Blocked';
      }
    } else {
      throw new Error('Server error');
    }
  } catch (e) {
    connectionDot.classList.remove('connected');
    connectionText.textContent = 'Cannot connect';
    accessDot.classList.remove('allowed');
    accessText.textContent = 'Blocked (fail-safe)';
  }
}

// Show message helper
function showMessage(text, type) {
  messageDiv.textContent = text;
  messageDiv.className = `message ${type}`;
  setTimeout(() => {
    messageDiv.className = 'message';
  }, 3000);
}
