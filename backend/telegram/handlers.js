const bot = require('./bot.js');
const { parseCommand } = require('../ai/commandParser.js');
const db = require('../db.js');

const DEVICE_ID = 'default';

/**
 * Send a notification message to the authorized parent
 * @param {string} message - The message to send
 */
async function sendNotification(message) {
  const chatId = process.env.TELEGRAM_USER_ID;
  if (!chatId) {
    console.error('TELEGRAM_USER_ID not configured');
    return;
  }
  try {
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.error('Failed to send notification:', error.message);
  }
}

/**
 * Format time remaining in a human-readable way
 * @param {number} minutes - Minutes remaining
 * @returns {string} Formatted time string
 */
function formatTimeRemaining(minutes) {
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }
  return `${hours} hour${hours !== 1 ? 's' : ''} and ${mins} minute${mins !== 1 ? 's' : ''}`;
}

/**
 * Format a timestamp to a readable time
 * @param {Date} date - The date to format
 * @returns {string} Formatted time string (e.g., "3:45 PM")
 */
function formatTime(date) {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Handle ALLOW_INTERNET action
 */
async function handleAllowInternet(chatId, params) {
  const duration = params.duration_minutes || params.duration || 30; // Default 30 minutes
  const expiresAt = Date.now() + duration * 60 * 1000;
  const endTime = new Date(expiresAt);

  db.updateRules(DEVICE_ID, {
    internetAllowed: true,
    internetExpiresAt: expiresAt
  });

  await bot.sendMessage(
    chatId,
    `✅ Internet enabled for ${formatTimeRemaining(duration)}. Will turn off at ${formatTime(endTime)}.`
  );
}

/**
 * Handle BLOCK_INTERNET action
 */
async function handleBlockInternet(chatId) {
  db.updateRules(DEVICE_ID, {
    internetAllowed: false,
    internetExpiresAt: null
  });

  await bot.sendMessage(chatId, '🚫 Internet blocked immediately.');
}

/**
 * Handle ALLOW_CHANNEL action
 */
async function handleAllowChannel(chatId, params) {
  const channelName = params.channel_name || params.channel;
  if (!channelName) {
    await bot.sendMessage(chatId, '❓ Please specify a channel name.');
    return;
  }

  db.addChannelRule(channelName, null, 'allow');

  await bot.sendMessage(chatId, `✅ ${channelName} added to allowed list. Videos from this channel will no longer be blocked.`);
}

/**
 * Handle BLOCK_CHANNEL action
 */
async function handleBlockChannel(chatId, params) {
  const channelName = params.channel_name || params.channel;
  if (!channelName) {
    await bot.sendMessage(chatId, '❓ Please specify a channel name.');
    return;
  }

  db.addChannelRule(channelName, null, 'block');

  await bot.sendMessage(chatId, `🚫 ${channelName} added to blocked list.`);
}

/**
 * Handle GET_WATCH_HISTORY action
 */
async function handleGetWatchHistory(chatId, params) {
  // Calculate 'since' based on time_period
  let since = null;
  const period = params.time_period || 'today';
  const now = Date.now();

  if (period === 'today') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    since = today.getTime();
  } else if (period === 'week') {
    since = now - 7 * 24 * 60 * 60 * 1000;
  }

  const history = db.getWatchHistory(DEVICE_ID, since, 20);

  if (!history || history.length === 0) {
    await bot.sendMessage(chatId, '📺 No watch history found.');
    return;
  }

  let message = `📺 *Watch History (${period})*\n\n`;

  for (const entry of history) {
    const status = entry.classification === 'allowed' ? '✅' : '🚫';
    const time = new Date(entry.watchedAt).toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    message += `${status} *${entry.title}*\n`;
    message += `   ${entry.channelName || 'Unknown channel'} • ${time}\n`;
    if (entry.classification === 'blocked') {
      message += `   Reason: ${entry.reason}\n`;
    }
    message += '\n';
  }

  await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

/**
 * Handle GET_STATUS action
 */
async function handleGetStatus(chatId) {
  const rules = db.getRules(DEVICE_ID);

  let message = '📊 *Current Status*\n\n';

  // Internet status
  if (rules.internetAllowed) {
    message += '🌐 Internet: *Enabled*\n';
    if (rules.internetExpiresAt) {
      const endTime = new Date(rules.internetExpiresAt);
      const now = Date.now();
      const remainingMs = rules.internetExpiresAt - now;

      if (remainingMs > 0) {
        const remainingMins = Math.ceil(remainingMs / 60000);
        message += `   ⏱ Time remaining: ${formatTimeRemaining(remainingMins)}\n`;
        message += `   Turns off at: ${formatTime(endTime)}\n`;
      } else {
        message += '   ⚠️ Timer expired\n';
      }
    } else {
      message += '   No time limit set\n';
    }
  } else {
    message += '🌐 Internet: *Blocked*\n';
  }

  // Strictness level
  message += `\n🔒 Strictness: *${rules.aiStrictness}*\n`;

  // Channel rules summary
  const channelRules = db.getAllChannelRules();
  if (channelRules && channelRules.length > 0) {
    const allowed = channelRules.filter(r => r.action === 'allow').length;
    const blocked = channelRules.filter(r => r.action === 'block').length;
    message += `\n📺 Channels: ${allowed} allowed, ${blocked} blocked\n`;
  }

  // Today's stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const stats = db.getWatchStats(DEVICE_ID, today.getTime());
  if (stats.total > 0) {
    message += `\n📈 Today: ${stats.allowed} allowed, ${stats.blocked} blocked\n`;
  }

  await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

/**
 * Handle SET_STRICTNESS action
 */
async function handleSetStrictness(chatId, params) {
  const level = params.level;
  const validLevels = ['strict', 'moderate', 'lenient'];

  if (!level || !validLevels.includes(level.toLowerCase())) {
    await bot.sendMessage(
      chatId,
      `❓ Please specify a valid strictness level: ${validLevels.join(', ')}`
    );
    return;
  }

  db.updateRules(DEVICE_ID, {
    aiStrictness: level.toLowerCase()
  });

  const descriptions = {
    lenient: 'Most content allowed, only blocks clearly inappropriate material',
    moderate: 'Educational + wholesome entertainment allowed, blocks gaming/pranks/drama',
    strict: 'Only educational content allowed (school subjects, documentaries, tutorials)'
  };

  await bot.sendMessage(
    chatId,
    `🔒 Strictness set to *${level.toLowerCase()}*\n\n${descriptions[level.toLowerCase()]}`,
    { parse_mode: 'Markdown' }
  );
}

/**
 * Handle unknown/unrecognized commands
 */
async function handleUnknown(chatId) {
  await bot.sendMessage(
    chatId,
    "❓ I didn't understand that. Try:\n\n" +
    "• \"allow internet for 30 mins\"\n" +
    "• \"block internet\"\n" +
    "• \"allow MrBeast channel\"\n" +
    "• \"what's being watched?\"\n" +
    "• \"status\"\n" +
    "• \"be more strict\" / \"be more lenient\""
  );
}

/**
 * Initialize the bot with all message handlers
 */
function initBot() {
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Ignore non-text messages
    if (!text) {
      return;
    }

    // Verify it's the authorized parent
    if (chatId.toString() !== process.env.TELEGRAM_USER_ID) {
      return bot.sendMessage(chatId, "⛔ Unauthorized. This bot is private.");
    }

    try {
      // Parse command with AI
      const { action, params } = await parseCommand(text);

      console.log(`Telegram command: "${text}" -> ${action}`, params);

      // Execute based on action
      switch (action) {
        case 'ALLOW_INTERNET':
          await handleAllowInternet(chatId, params || {});
          break;

        case 'BLOCK_INTERNET':
          await handleBlockInternet(chatId);
          break;

        case 'ALLOW_CHANNEL':
          await handleAllowChannel(chatId, params || {});
          break;

        case 'BLOCK_CHANNEL':
          await handleBlockChannel(chatId, params || {});
          break;

        case 'GET_WATCH_HISTORY':
          await handleGetWatchHistory(chatId, params || {});
          break;

        case 'GET_STATUS':
          await handleGetStatus(chatId);
          break;

        case 'SET_STRICTNESS':
          await handleSetStrictness(chatId, params || {});
          break;

        case 'UNKNOWN':
        default:
          await handleUnknown(chatId);
          break;
      }
    } catch (error) {
      console.error('Error handling message:', error);
      await bot.sendMessage(
        chatId,
        '⚠️ Something went wrong. Please try again.'
      );
    }
  });

  // Handle polling errors
  bot.on('polling_error', (error) => {
    console.error('Telegram polling error:', error.message);
  });

  console.log('Telegram bot initialized and listening for messages');
}

module.exports = {
  initBot,
  sendNotification
};
