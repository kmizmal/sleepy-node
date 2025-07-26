// routes/events.js
const express = require('express');
const router = express.Router();
const { authenticateGetSecret } = require('../middleware');
const { logWithCategory } = require('../logger');
const { LOG_CATEGORIES } = require('../constants');
const { sseClients, currentStatus, sendSSEMessage } = require('../sse');
const config = require('../config');

// SSE 事件流
router.get('/', authenticateGetSecret, (req, res) => {
  const origin = req.headers.origin;

  if (!origin || config.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    logWithCategory('warn', LOG_CATEGORIES.CORS, 'SSE CORS forbidden', { origin });
    res.writeHead(403);
    res.end('CORS Forbidden: Origin not allowed');
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  res.flushHeaders?.();
  currentStatus.observer = sseClients.size + 1;

  logWithCategory('info', LOG_CATEGORIES.SSE, 'New SSE connection', {
    observer: currentStatus.observer,
    origin: origin || 'local/unknown',
    ip: req.ip,
    totalConnections: sseClients.size + 1
  });

  sseClients.add(res);
  sendSSEMessage(new Set([res]), 'update', currentStatus);

  req.on('close', () => {
    logWithCategory('info', LOG_CATEGORIES.SSE, 'SSE connection closed', {
      observer: currentStatus.observer,
      origin: origin || 'local/unknown',
      totalConnections: sseClients.size - 1
    });
    sseClients.delete(res);
  });

  req.on('error', (err) => {
    const ignoredErrors = ['aborted', 'ECONNRESET'];

    if (ignoredErrors.includes(err.code) || err.message === 'aborted') {
      logWithCategory('debug', LOG_CATEGORIES.SSE, 'SSE connection closed (client aborted)', {
        observer: currentStatus.observer,
        origin: origin || 'local/unknown'
      });
    } else {
      logWithCategory('error', LOG_CATEGORIES.SSE, 'SSE connection error', {
        observer: currentStatus.observer,
        error: err.message,
        origin: origin || 'local/unknown'
      });
    }

    sseClients.delete(res);
    currentStatus.observer = sseClients.size;
  });

});

module.exports = router;