const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: {
    autoStart: true,
    params: {
      timeout: 30
    }
  }
});

// Handle polling errors gracefully - prevent crashes
bot.on('polling_error', (error) => {
  console.error('Telegram polling error:', error.code || error.message);
});

bot.on('error', (error) => {
  console.error('Telegram bot error:', error.code || error.message);
});

module.exports = bot;
