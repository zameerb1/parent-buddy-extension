const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are a parental control assistant. Parse the parent's natural language command into a structured action.

Possible actions:
- ALLOW_INTERNET: duration_minutes (number or null for indefinite)
- BLOCK_INTERNET: no params
- ALLOW_CHANNEL: channel_name
- BLOCK_CHANNEL: channel_name
- GET_WATCH_HISTORY: time_period (today, week, etc)
- GET_STATUS: no params
- SET_STRICTNESS: level (strict, moderate, lenient)
- UNKNOWN: if you can't understand

Respond with JSON only:
{"action": "ACTION_NAME", "params": {...}}`;

/**
 * Parse a natural language command from a parent into a structured action
 * @param {string} text - The natural language command from the parent
 * @returns {Promise<{action: string, params: object}>} - The parsed action and parameters
 */
async function parseCommand(text) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text }
      ],
      temperature: 0,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      return { action: 'UNKNOWN', params: {} };
    }

    const parsed = JSON.parse(content);

    return {
      action: parsed.action || 'UNKNOWN',
      params: parsed.params || {}
    };
  } catch (error) {
    console.error('Command parsing error:', error.message);
    return { action: 'UNKNOWN', params: {} };
  }
}

module.exports = { parseCommand };
