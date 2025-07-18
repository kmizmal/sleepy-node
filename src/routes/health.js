// routes/health.js
const express = require('express');
const router = express.Router();
const { sseClients } = require('../sse');
const { logger } = require('../logger');
const config = require('../config');

// 健康检查
router.get('/', (req, res) => {
  const healthData = {
    status: 'OK',
    connections: sseClients.size,
    timestamp: new Date().toISOString(),
    auth: {
      setSecretConfigured: !!config.SET_SECRET,
      getSecretConfigured: !!config.GET_SECRET
    },
    logging: {
      level: logger.level,
      transports: logger.transports.length
    }
  };
  
  res.json(healthData);
});

module.exports = router;