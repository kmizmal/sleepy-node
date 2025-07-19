// app.js
const express = require('express');
const cors = require('cors');
const expressWinston = require('express-winston');
const config = require('./src/config');
const { logger, logWithCategory } = require('./src/logger');
const { LOG_CATEGORIES } = require('./src/constants');
const { sseClients, sendHeartbeat } = require('./src/sse');
const middleware = require('./src/middleware');

const app = express();

// 路由
const statusRouter = require('./src/routes/status');
const authRouter = require('./src/routes/auth');
const eventsRouter = require('./src/routes/events');
const healthRouter = require('./src/routes/health');

// HTTP请求日志
app.use(expressWinston.logger({
  winstonInstance: logger,
  meta: true,
  msg: "HTTP {{req.method}} {{req.url}} {{res.statusCode}} {{res.responseTime}}ms",
  expressFormat: false,
  colorize: false,
  ignoreRoute: (req) => req.url === '/health' || req.url === '/events',
  requestWhitelist: ['url', 'method', 'originalUrl', 'query'],
  responseWhitelist: ['statusCode'],
  dynamicMeta: (req, res) => ({
    category: LOG_CATEGORIES.API,
    metadata: {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      origin: req.get('Origin')
    }
  })
}));

// 中间件
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || config.allowedOrigins.includes(origin)) {
      logWithCategory('debug', LOG_CATEGORIES.CORS, 'CORS request approved', { origin });
      callback(null, true);
    } else {
      logWithCategory('warn', LOG_CATEGORIES.CORS, 'CORS request blocked', { origin, allowedOrigins: config.allowedOrigins });
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));

app.use('/api/', middleware.limiter);
app.use(express.json());

app.get('/', (req, res) => {
  res.redirect('https://github.com/kmizmal/sleepy-node');
});

// 路由注册
app.use('/api/status', statusRouter);
app.use('/device/set',statusRouter);// 兼容旧的 /device/set 路径
app.use('/auth', authRouter);
app.use('/events', eventsRouter);
app.use('/health', healthRouter);

// 错误日志
app.use(expressWinston.errorLogger({
  winstonInstance: logger,
  meta: true,
  msg: "HTTP Error {{req.method}} {{req.url}} {{err.status}} {{err.message}}",
  dynamicMeta: (req, res, err) => ({
    category: LOG_CATEGORIES.SYSTEM,
    metadata: {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      origin: req.get('Origin')
    }
  })
}));

// 错误处理
app.use((err, req, res, next) => {
  logWithCategory('error', LOG_CATEGORIES.SYSTEM, 'Unhandled error', {
    error: err.message,
    stack: err.stack,
    ip: req.ip,
    path: req.path,
    method: req.method
  });
  res.status(500).json({ error: 'Internal server error' });
});

// 启动服务器
app.listen(config.PORT,config.HOST, () => {
  logWithCategory(
    'info',
    LOG_CATEGORIES.SYSTEM,
    `Server started on http://${config.HOST}:${config.PORT}`,
    {
      setSecretConfigured: !!config.SET_SECRET,
      getSecretConfigured: !!config.GET_SECRET,
      logLevel: logger.level,
    }
  );  
  sendHeartbeat();
});

process.on('SIGTERM', () => {
  logWithCategory('info', LOG_CATEGORIES.SYSTEM, 'Graceful shutdown initiated');
  sseClients.forEach(client => {
    try {
      client.end();
    } catch (error) {
      logWithCategory('error', LOG_CATEGORIES.SSE, 'Error closing SSE connection during shutdown', {
        error: error.message
      });
    }
  });
  logWithCategory('info', LOG_CATEGORIES.SYSTEM, 'Server shutdown complete');
  process.exit(0);
});

// 未捕获异常处理
process.on('uncaughtException', (err) => {
  logWithCategory('error', LOG_CATEGORIES.SYSTEM, 'Uncaught Exception', {
    error: err.message,
    stack: err.stack
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logWithCategory('error', LOG_CATEGORIES.SYSTEM, 'Unhandled Rejection', {
    reason,
    promise
  });
});

module.exports = app;