const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'parental_control.db');

let db = null;

/**
 * Initialize the database and create tables
 * @returns {Database} The database instance
 */
function initDb() {
  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');

  // Create rules table
  db.exec(`
    CREATE TABLE IF NOT EXISTS rules (
      device_id TEXT PRIMARY KEY,
      internet_allowed BOOLEAN DEFAULT FALSE,
      internet_expires_at INTEGER,
      ai_strictness TEXT DEFAULT 'moderate',
      updated_at INTEGER
    )
  `);

  // Create channel rules table
  db.exec(`
    CREATE TABLE IF NOT EXISTS channel_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT,
      channel_name TEXT,
      action TEXT,
      created_at INTEGER
    )
  `);

  // Create index for faster channel lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_channel_rules_name
    ON channel_rules(channel_name)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_channel_rules_id
    ON channel_rules(channel_id)
  `);

  // Create watch history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS watch_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT,
      video_id TEXT,
      title TEXT,
      channel_name TEXT,
      channel_id TEXT,
      classification TEXT,
      reason TEXT,
      watched_at INTEGER
    )
  `);

  // Create index for watch history queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_watch_history_device
    ON watch_history(device_id, watched_at)
  `);

  // Create classification cache table
  db.exec(`
    CREATE TABLE IF NOT EXISTS classification_cache (
      video_id TEXT PRIMARY KEY,
      allowed BOOLEAN,
      reason TEXT,
      classified_at INTEGER
    )
  `);

  console.log('Database initialized successfully');
  return db;
}

/**
 * Get the database instance
 * @returns {Database} The database instance
 */
function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

/**
 * Get rules for a device, creating default rules if none exist
 * @param {string} deviceId - The device identifier
 * @returns {Object} The rules for the device
 */
function getRules(deviceId) {
  const db = getDb();

  let rules = db.prepare(`
    SELECT * FROM rules WHERE device_id = ?
  `).get(deviceId);

  if (!rules) {
    // Create default rules for new device
    const now = Date.now();
    db.prepare(`
      INSERT INTO rules (device_id, internet_allowed, ai_strictness, updated_at)
      VALUES (?, FALSE, 'moderate', ?)
    `).run(deviceId, now);

    rules = {
      device_id: deviceId,
      internet_allowed: false,
      internet_expires_at: null,
      ai_strictness: 'moderate',
      updated_at: now
    };
  }

  return {
    deviceId: rules.device_id,
    internetAllowed: Boolean(rules.internet_allowed),
    internetExpiresAt: rules.internet_expires_at,
    aiStrictness: rules.ai_strictness,
    updatedAt: rules.updated_at
  };
}

/**
 * Update rules for a device
 * @param {string} deviceId - The device identifier
 * @param {Object} updates - The updates to apply
 * @returns {Object} The updated rules
 */
function updateRules(deviceId, updates) {
  const db = getDb();
  const now = Date.now();

  // Ensure device exists
  getRules(deviceId);

  const fields = [];
  const values = [];

  if (updates.internetAllowed !== undefined) {
    fields.push('internet_allowed = ?');
    values.push(updates.internetAllowed ? 1 : 0);
  }

  if (updates.internetExpiresAt !== undefined) {
    fields.push('internet_expires_at = ?');
    values.push(updates.internetExpiresAt);
  }

  if (updates.aiStrictness !== undefined) {
    fields.push('ai_strictness = ?');
    values.push(updates.aiStrictness);
  }

  fields.push('updated_at = ?');
  values.push(now);
  values.push(deviceId);

  db.prepare(`
    UPDATE rules SET ${fields.join(', ')} WHERE device_id = ?
  `).run(...values);

  return getRules(deviceId);
}

/**
 * Get channel rule by channel name or ID
 * @param {string} channelName - The channel name to look up
 * @param {string} [channelId] - Optional channel ID to look up
 * @returns {Object|null} The channel rule or null if not found
 */
function getChannelRule(channelName, channelId = null) {
  const db = getDb();

  // Try to find by channel ID first (more reliable)
  if (channelId) {
    const ruleById = db.prepare(`
      SELECT * FROM channel_rules WHERE channel_id = ? ORDER BY created_at DESC LIMIT 1
    `).get(channelId);

    if (ruleById) {
      return {
        id: ruleById.id,
        channelId: ruleById.channel_id,
        channelName: ruleById.channel_name,
        action: ruleById.action,
        createdAt: ruleById.created_at
      };
    }
  }

  // Fall back to channel name lookup (case-insensitive)
  const ruleByName = db.prepare(`
    SELECT * FROM channel_rules
    WHERE LOWER(channel_name) = LOWER(?)
    ORDER BY created_at DESC LIMIT 1
  `).get(channelName);

  if (ruleByName) {
    return {
      id: ruleByName.id,
      channelId: ruleByName.channel_id,
      channelName: ruleByName.channel_name,
      action: ruleByName.action,
      createdAt: ruleByName.created_at
    };
  }

  return null;
}

/**
 * Add a channel rule (allow or block)
 * @param {string} channelName - The channel name
 * @param {string} channelId - The channel ID
 * @param {string} action - The action ('allow' or 'block')
 * @returns {Object} The created rule
 */
function addChannelRule(channelName, channelId, action) {
  const db = getDb();
  const now = Date.now();

  // Validate action
  if (!['allow', 'block'].includes(action)) {
    throw new Error('Action must be "allow" or "block"');
  }

  // Remove any existing rules for this channel
  db.prepare(`
    DELETE FROM channel_rules
    WHERE channel_id = ? OR LOWER(channel_name) = LOWER(?)
  `).run(channelId, channelName);

  // Insert new rule
  const result = db.prepare(`
    INSERT INTO channel_rules (channel_id, channel_name, action, created_at)
    VALUES (?, ?, ?, ?)
  `).run(channelId, channelName, action, now);

  return {
    id: result.lastInsertRowid,
    channelId,
    channelName,
    action,
    createdAt: now
  };
}

/**
 * Remove a channel rule
 * @param {string} channelName - The channel name
 * @param {string} [channelId] - Optional channel ID
 * @returns {boolean} True if a rule was removed
 */
function removeChannelRule(channelName, channelId = null) {
  const db = getDb();

  let result;
  if (channelId) {
    result = db.prepare(`
      DELETE FROM channel_rules WHERE channel_id = ?
    `).run(channelId);
  } else {
    result = db.prepare(`
      DELETE FROM channel_rules WHERE LOWER(channel_name) = LOWER(?)
    `).run(channelName);
  }

  return result.changes > 0;
}

/**
 * Get all channel rules
 * @returns {Array} All channel rules
 */
function getAllChannelRules() {
  const db = getDb();

  const rules = db.prepare(`
    SELECT * FROM channel_rules ORDER BY created_at DESC
  `).all();

  return rules.map(rule => ({
    id: rule.id,
    channelId: rule.channel_id,
    channelName: rule.channel_name,
    action: rule.action,
    createdAt: rule.created_at
  }));
}

/**
 * Get cached classification for a video
 * @param {string} videoId - The video ID
 * @returns {Object|null} The cached classification or null
 */
function getCachedClassification(videoId) {
  const db = getDb();

  const cached = db.prepare(`
    SELECT * FROM classification_cache WHERE video_id = ?
  `).get(videoId);

  if (!cached) {
    return null;
  }

  // Check if cache is still valid (24 hours)
  const cacheMaxAge = 24 * 60 * 60 * 1000;
  if (Date.now() - cached.classified_at > cacheMaxAge) {
    // Cache expired, remove it
    db.prepare(`DELETE FROM classification_cache WHERE video_id = ?`).run(videoId);
    return null;
  }

  return {
    videoId: cached.video_id,
    allowed: Boolean(cached.allowed),
    reason: cached.reason,
    classifiedAt: cached.classified_at
  };
}

/**
 * Cache a classification result
 * @param {string} videoId - The video ID
 * @param {boolean} allowed - Whether the video is allowed
 * @param {string} reason - The reason for the classification
 * @returns {Object} The cached classification
 */
function cacheClassification(videoId, allowed, reason) {
  const db = getDb();
  const now = Date.now();

  db.prepare(`
    INSERT OR REPLACE INTO classification_cache (video_id, allowed, reason, classified_at)
    VALUES (?, ?, ?, ?)
  `).run(videoId, allowed ? 1 : 0, reason, now);

  return {
    videoId,
    allowed,
    reason,
    classifiedAt: now
  };
}

/**
 * Log a video watch event
 * @param {string} deviceId - The device identifier
 * @param {Object} videoData - The video data
 * @returns {Object} The logged watch entry
 */
function logWatch(deviceId, videoData) {
  const db = getDb();
  const now = Date.now();

  const result = db.prepare(`
    INSERT INTO watch_history (device_id, video_id, title, channel_name, channel_id, classification, reason, watched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    deviceId,
    videoData.videoId,
    videoData.title,
    videoData.channelName,
    videoData.channelId || null,
    videoData.classification,
    videoData.reason || null,
    now
  );

  return {
    id: result.lastInsertRowid,
    deviceId,
    ...videoData,
    watchedAt: now
  };
}

/**
 * Get watch history for a device
 * @param {string} deviceId - The device identifier
 * @param {number} [since] - Optional timestamp to filter from
 * @param {number} [limit=100] - Maximum number of entries to return
 * @returns {Array} The watch history entries
 */
function getWatchHistory(deviceId, since = null, limit = 100) {
  const db = getDb();

  let query = `
    SELECT * FROM watch_history
    WHERE device_id = ?
  `;
  const params = [deviceId];

  if (since) {
    query += ` AND watched_at >= ?`;
    params.push(since);
  }

  query += ` ORDER BY watched_at DESC LIMIT ?`;
  params.push(limit);

  const history = db.prepare(query).all(...params);

  return history.map(entry => ({
    id: entry.id,
    deviceId: entry.device_id,
    videoId: entry.video_id,
    title: entry.title,
    channelName: entry.channel_name,
    channelId: entry.channel_id,
    classification: entry.classification,
    reason: entry.reason,
    watchedAt: entry.watched_at
  }));
}

/**
 * Get watch statistics for a device
 * @param {string} deviceId - The device identifier
 * @param {number} [since] - Optional timestamp to filter from
 * @returns {Object} Watch statistics
 */
function getWatchStats(deviceId, since = null) {
  const db = getDb();

  let query = `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN classification = 'allowed' THEN 1 ELSE 0 END) as allowed,
      SUM(CASE WHEN classification = 'blocked' THEN 1 ELSE 0 END) as blocked
    FROM watch_history
    WHERE device_id = ?
  `;
  const params = [deviceId];

  if (since) {
    query += ` AND watched_at >= ?`;
    params.push(since);
  }

  const stats = db.prepare(query).get(...params);

  return {
    total: stats.total || 0,
    allowed: stats.allowed || 0,
    blocked: stats.blocked || 0
  };
}

/**
 * Close the database connection
 */
function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  initDb,
  getDb,
  getRules,
  updateRules,
  getChannelRule,
  addChannelRule,
  removeChannelRule,
  getAllChannelRules,
  getCachedClassification,
  cacheClassification,
  logWatch,
  getWatchHistory,
  getWatchStats,
  closeDb
};
