// Shared blocked sites storage
// Used by both /api/check and /api/tabs/block

const blockedSites = new Map(); // domain -> { url, title, blockedAt }

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

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

function isBlocked(url) {
  const domain = getDomain(url);
  return blockedSites.has(domain);
}

function getAll() {
  return Array.from(blockedSites.values());
}

module.exports = { block, unblock, isBlocked, getAll, getDomain };
