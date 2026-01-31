// Blocked = temporary (clears on internet enable)
// Banned = permanent (always blocked)

const blockedSites = new Map(); // domain -> { url, title, blockedAt }
const bannedSites = new Map();  // domain -> { url, title, bannedAt }

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// === BLOCK (temporary) ===
function block(url, title) {
  const domain = getDomain(url);
  blockedSites.set(domain, { url, title, domain, blockedAt: Date.now() });
  console.log(`[Blocked] ${domain}`);
}

function unblock(url) {
  const domain = getDomain(url);
  blockedSites.delete(domain);
  console.log(`[Unblocked] ${domain}`);
}

function clearAllBlocked() {
  blockedSites.clear();
  console.log(`[Blocked] Cleared all`);
}

function getBlocked() {
  return Array.from(blockedSites.values());
}

// === BAN (permanent) ===
function ban(url, title) {
  const domain = getDomain(url);
  bannedSites.set(domain, { url, title, domain, bannedAt: Date.now() });
  // Also remove from blocked if it was there
  blockedSites.delete(domain);
  console.log(`[Banned] ${domain}`);
}

function unban(url) {
  const domain = getDomain(url);
  bannedSites.delete(domain);
  console.log(`[Unbanned] ${domain}`);
}

function getBanned() {
  return Array.from(bannedSites.values());
}

// === CHECK ===
function isBlocked(url) {
  const domain = getDomain(url);
  return blockedSites.has(domain);
}

function isBanned(url) {
  const domain = getDomain(url);
  return bannedSites.has(domain);
}

module.exports = {
  block, unblock, clearAllBlocked, getBlocked, isBlocked,
  ban, unban, getBanned, isBanned,
  getDomain
};
