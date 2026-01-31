const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Classify if a YouTube video is appropriate for a child
 * @param {string} title - The video title
 * @param {string} channelName - The channel name
 * @param {string} descriptionPreview - A preview of the video description
 * @param {string} strictness - The strictness level (strict, moderate, lenient)
 * @returns {Promise<{allowed: boolean, reason: string}>} - Classification result
 */
async function classifyVideo(title, channelName, descriptionPreview, strictness) {
  const systemPrompt = `Classify if this YouTube video is appropriate for a child. Respond JSON only.

Strictness: ${strictness}

STRICT: Only clearly educational (school subjects, documentaries, tutorials). Block entertainment, gaming, vlogs.
MODERATE: Allow educational + wholesome entertainment. Block gaming, pranks, drama, "brain rot."
LENIENT: Allow most content. Only block clearly inappropriate material.

Title: ${title}
Channel: ${channelName}
Description preview: ${descriptionPreview}

{"allowed": true/false, "reason": "brief reason"}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt }
      ],
      temperature: 0,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      return { allowed: false, reason: 'Classification unavailable' };
    }

    const parsed = JSON.parse(content);

    return {
      allowed: Boolean(parsed.allowed),
      reason: parsed.reason || 'No reason provided'
    };
  } catch (error) {
    console.error('Video classification error:', error.message);
    return { allowed: false, reason: 'Classification unavailable' };
  }
}

module.exports = { classifyVideo };
