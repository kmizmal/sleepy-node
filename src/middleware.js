// middleware.js
const rateLimit = require('express-rate-limit');
const { logWithCategory } = require('./logger');
const { LOG_CATEGORIES } = require('./constants');
const config = require('./config');

// 限流中间件
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests from this IP, please try again later.' },
  handler: (req, res) => {
    logWithCategory('warn', LOG_CATEGORIES.RATE_LIMIT, 'Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path
    });
    res.status(429).json({ error: 'Too many requests from this IP, please try again later.' });
  }
});

const strictLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1分钟（60000毫秒）
  max: config.Limiter,  // 每分钟最多请求
  handler: (req, res) => {
    logWithCategory('warn', LOG_CATEGORIES.RATE_LIMIT, 'Strict rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path
    });
    res.status(429).json({ error: '请求过于频繁，请稍后再试。' });
  }
});


// 认证中间件
const authenticateSetSecret = (req, res, next) => {
  const providedSecret = req.headers['x-set-secret'] ||
    req.body?.secret ||
    req.query.secret;

  if (!providedSecret) {
    logWithCategory('warn', LOG_CATEGORIES.AUTH, 'SET secret missing', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path
    });
    return res.status(401).json({
      error: 'SET secret required. Provide via x-set-secret header, POST body, or query parameter'
    });
  }

  if (providedSecret !== config.SET_SECRET) {
    logWithCategory('warn', LOG_CATEGORIES.SECURITY, 'Invalid SET secret attempt', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path
    });
    return res.status(403).json({ error: 'Invalid SET secret' });
  }

  logWithCategory('debug', LOG_CATEGORIES.AUTH, 'SET authentication successful', {
    ip: req.ip,
    endpoint: req.path
  });
  next();
};

const authenticateGetSecret = (req, res, next) => {
  const providedSecret = req.headers['x-get-secret'] ||
    req.query.secret;

  if (!providedSecret) {
    logWithCategory('warn', LOG_CATEGORIES.AUTH, 'GET secret missing', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path
    });
    return res.status(401).json({
      error: 'GET secret required. Provide via x-get-secret header or getsecret query parameter'
    });
  }

  if (providedSecret !== config.GET_SECRET) {
    logWithCategory('warn', LOG_CATEGORIES.SECURITY, 'Invalid GET secret attempt', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path
    });
    return res.status(403).json({ error: 'Invalid GET secret' });
  }

  logWithCategory('debug', LOG_CATEGORIES.AUTH, 'GET authentication successful', {
    ip: req.ip,
    endpoint: req.path
  });
  next();
};

module.exports = {
  limiter,
  strictLimiter,
  authenticateSetSecret,
  authenticateGetSecret
};