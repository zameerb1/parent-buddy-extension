const express = require('express');
const router = express.Router();
const db = require('../db.js');
const { classifyVideo } = require('../ai/videoClassifier.js');
const { sendNotification } = require('../telegram/handlers.js');

/**
 * POST /api/video
 * Check if a YouTube video should be allowed
 * Request body: { deviceId, videoId, title, channelName, descriptionPreview }
 * Response: { allowed: true/false, reason: "..." }
 */
router.post('/', async (req, res) => {
  try {
    const { deviceId, videoId, title, channelName, descriptionPreview } = req.body;

    // Validate required fields
    if (!deviceId) {
      return res.status(400).json({
        allowed: false,
        reason: 'Missing required parameter: deviceId'
      });
    }

    if (!videoId) {
      return res.status(400).json({
        allowed: false,
        reason: 'Missing required parameter: videoId'
      });
    }

    // Step 1: Check if internet is allowed for device first
    const rules = db.getRules(deviceId);
    const now = Date.now();
    let internetAllowed = rules.internetAllowed;
    const expiresAt = rules.internetExpiresAt;

    // Check if internet time has expired
    if (internetAllowed && expiresAt && expiresAt <= now) {
      internetAllowed = false;
      db.updateRules(deviceId, { internetAllowed: false });
    }

    if (!internetAllowed) {
      return res.json({
        allowed: false,
        reason: expiresAt && expiresAt <= now
          ? 'Internet time has expired'
          : 'Internet access is currently disabled'
      });
    }

    // Step 2: Check if channel is in allowed list
    if (channelName) {
      const channelRule = db.getChannelRule(channelName);

      if (channelRule) {
        if (channelRule.action === 'allow') {
          // Log the allowed video
          db.logWatch(deviceId, {
            videoId,
            title: title || '',
            channelName,
            classification: 'allowed',
            reason: 'Channel is in allowed list'
          });

          return res.json({
            allowed: true,
            reason: 'Channel is in allowed list'
          });
        }

        // Step 3: Channel is in blocked list
        if (channelRule.action === 'block') {
          // Log the blocked video
          db.logWatch(deviceId, {
            videoId,
            title: title || '',
            channelName,
            classification: 'blocked',
            reason: 'Channel is blocked'
          });

          return res.json({
            allowed: false,
            reason: 'Channel is blocked'
          });
        }
      }
    }

    // Step 4: Check classification cache
    const cachedResult = db.getCachedClassification(videoId);
    if (cachedResult) {
      // Log the video with cached result
      db.logWatch(deviceId, {
        videoId,
        title: title || '',
        channelName: channelName || '',
        classification: cachedResult.allowed ? 'allowed' : 'blocked',
        reason: cachedResult.reason
      });

      return res.json({
        allowed: cachedResult.allowed,
        reason: cachedResult.reason
      });
    }

    // Step 5: Call AI classifier for new classification
    const strictness = rules.aiStrictness || 'moderate';
    const classification = await classifyVideo(
      title || '',
      channelName || '',
      descriptionPreview || '',
      strictness
    );

    // Cache the classification result
    db.cacheClassification(videoId, classification.allowed, classification.reason);

    // Log the video
    db.logWatch(deviceId, {
      videoId,
      title: title || '',
      channelName: channelName || '',
      classification: classification.allowed ? 'allowed' : 'blocked',
      reason: classification.reason
    });

    // Send notification if blocked
    if (!classification.allowed) {
      sendNotification(
        `🚫 Video Blocked\n\n` +
        `Title: "${title || 'Unknown'}"\n` +
        `Channel: ${channelName || 'Unknown'}\n` +
        `Reason: ${classification.reason}\n\n` +
        `Reply "allow this" to unblock, or "allow ${channelName}" to always allow this channel.`
      );
    }

    res.json({
      allowed: classification.allowed,
      reason: classification.reason
    });

  } catch (error) {
    console.error('Error in /api/video:', error);
    res.status(500).json({
      allowed: false,
      reason: 'Internal server error while checking video'
    });
  }
});

module.exports = router;
