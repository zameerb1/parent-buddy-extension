const express = require('express');
const router = express.Router();

const statusRouter = require('./status.js');
const checkRouter = require('./check.js');
const videoRouter = require('./video.js');
const logRouter = require('./log.js');
const tabsRouter = require('./tabs.js');

// Mount route handlers
router.use('/status', statusRouter);
router.use('/check', checkRouter);
router.use('/video', videoRouter);
router.use('/log', logRouter);
router.use('/tabs', tabsRouter);

module.exports = router;
