// routes/auth.js
const express = require('express');
const router = express.Router();
const { authenticateGetSecret, authenticateSetSecret } = require('../middleware');
const { logWithCategory } = require('../logger');
const { LOG_CATEGORIES } = require('../constants');

// GET 认证测试
router.get('/test/get', authenticateGetSecret, (req, res) => {
  logWithCategory('info', LOG_CATEGORIES.AUTH, 'GET auth test successful', { ip: req.ip });
  res.json({ message: 'GET authentication successful', timestamp: new Date().toISOString() });
});

// POST 认证测试
router.post('/test/set', authenticateSetSecret, (req, res) => {
  logWithCategory('info', LOG_CATEGORIES.AUTH, 'SET auth test successful', { ip: req.ip });
  res.json({ message: 'SET authentication successful', timestamp: new Date().toISOString() });
});

module.exports = router;