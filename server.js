const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
require('winston-daily-rotate-file');
const expressWinston = require('express-winston');
require('dotenv').config();

// --- 日志目录必须先创建 ---
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// --- 日志分类和图标 ---
const LOG_CATEGORIES = {
  AUTH: 'AUTH',
  SSE: 'SSE',
  API: 'API',
  CORS: 'CORS',
  RATE_LIMIT: 'RATE_LIMIT',
  SYSTEM: 'SYSTEM',
  SECURITY: 'SECURITY'
};

function getCategoryIcon(category) {
  const icons = {
    AUTH: '🔐',
    SSE: '⚡',
    API: '🔄',
    CORS: '🌐',
    RATE_LIMIT: '⚠️',
    SYSTEM: '🚀',
    SECURITY: '🛡️'
  };
  return icons[category] || '📝';
}

// --- Winston Logger 配置 ---
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    // 自定义格式
    winston.format.printf(({ timestamp, level, message, category, metadata, stack }) => {
      const icon = getCategoryIcon(category);
      const metaStr = metadata ? ` | ${JSON.stringify(metadata)}` : '';
      const stackStr = stack ? `\n${stack}` : '';
      return `[${timestamp}] ${icon} ${level.toUpperCase()}:${category || 'GENERAL'} - ${message}${metaStr}${stackStr}`;
    })
  ),
  defaultMeta: { service: 'express-server' },
  transports: [
    // 控制台输出，带颜色
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, category, metadata, stack }) => {
          const icon = getCategoryIcon(category);
          const metaStr = metadata ? ` | ${JSON.stringify(metadata)}` : '';
          const stackStr = stack ? `\n${stack}` : '';
          return `[${timestamp}] ${icon} ${level}:${category || 'GENERAL'} - ${message}${metaStr}${stackStr}`;
        })
      )
    }),
    // 普通日志文件，按大小轮转
    new winston.transports.File({
      filename: path.join(logsDir, 'app.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),
    // 错误日志文件
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ]
});

// 日志辅助函数
function logWithCategory(level, category, message, metadata = {}) {
  logger.log(level, message, { category, metadata });
}

// --- 读取允许跨域的来源 ---
let allowedOrigins = [];
try {
  const originsPath = path.resolve('./allowedOrigins.json');
  allowedOrigins = JSON.parse(fs.readFileSync(originsPath, 'utf-8'));
  logWithCategory('info', LOG_CATEGORIES.SYSTEM, 'Loaded allowed origins', { count: allowedOrigins.length });
} catch (err) {
  logWithCategory('error', LOG_CATEGORIES.SYSTEM, 'Could not load allowedOrigins.json', { error: err.message });
  allowedOrigins = ['http://localhost:3000', 'http://127.0.0.1:5500'];
  logWithCategory('info', LOG_CATEGORIES.SYSTEM, 'Using default origins', { origins: allowedOrigins });
}

const app = express();
const PORT = process.env.PORT || 3000;

// 环境变量配置的密钥
const SET_SECRET = process.env.SECRET || 'default-set-secret';
const GET_SECRET = process.env.GET_SECRET || 'default-get-secret';

logWithCategory('info', LOG_CATEGORIES.AUTH, 'Secrets configured', {
  setSecretConfigured: !!SET_SECRET,
  getSecretConfigured: !!GET_SECRET
});

// --- Express Winston 记录 HTTP 请求 ---
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

// --- 限流配置 ---
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
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many write requests from this IP, please try again later.' },
  handler: (req, res) => {
    logWithCategory('warn', LOG_CATEGORIES.RATE_LIMIT, 'Strict rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path
    });
    res.status(429).json({ error: 'Too many write requests from this IP, please try again later.' });
  }
});

// --- CORS 配置 ---
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      logWithCategory('debug', LOG_CATEGORIES.CORS, 'CORS request approved', { origin });
      callback(null, true);
    } else {
      logWithCategory('warn', LOG_CATEGORIES.CORS, 'CORS request blocked', { origin, allowedOrigins });
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));

app.use('/api/', limiter);
app.use(express.json());

// --- SSE 相关 ---
const sseClients = new Set();

let currentStatus = {
  status: 0,
  device: {},
  last_updated: new Date().toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' }),
};

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

  if (providedSecret !== SET_SECRET) {
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

  if (providedSecret !== GET_SECRET) {
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

// SSE 消息发送辅助
function sendSSEMessage(clients, event, data) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  let successCount = 0;
  let errorCount = 0;
  
  clients.forEach(client => {
    try {
      client.write(message);
      successCount++;
    } catch (error) {
      errorCount++;
      logWithCategory('error', LOG_CATEGORIES.SSE, 'Error sending SSE message', {
        error: error.message,
        event
      });
      clients.delete(client);
    }
  });
  
  if (event !== 'heartbeat') { // 减少心跳日志噪音
    logWithCategory('debug', LOG_CATEGORIES.SSE, 'SSE message sent', {
      event,
      successCount,
      errorCount,
      totalClients: clients.size
    });
  }
}

// 心跳保持连接活跃
function sendHeartbeat() {
  setInterval(() => {
    const now = new Date().toISOString();
    if (sseClients.size > 0) {
      sendSSEMessage(sseClients, 'heartbeat', now);
    }
  }, 30000);
}

// SSE 事件流端点
app.get('/events', authenticateGetSecret, (req, res) => {
  const origin = req.headers.origin;

  if (!origin || allowedOrigins.includes(origin)) {
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

  logWithCategory('info', LOG_CATEGORIES.SSE, 'New SSE connection', {
    origin: origin || 'local/unknown',
    ip: req.ip,
    totalConnections: sseClients.size + 1
  });
  
  sseClients.add(res);
  sendSSEMessage(new Set([res]), 'update', currentStatus);

  req.on('close', () => {
    logWithCategory('info', LOG_CATEGORIES.SSE, 'SSE connection closed', {
      origin: origin || 'local/unknown',
      totalConnections: sseClients.size - 1
    });
    sseClients.delete(res);
  });

  req.on('error', (err) => {
    logWithCategory('error', LOG_CATEGORIES.SSE, 'SSE connection error', {
      error: err.message,
      origin: origin || 'local/unknown'
    });
    sseClients.delete(res);
  });
});

// API 端点：POST 更新状态
app.post('/api/status', strictLimiter, authenticateSetSecret, (req, res) => {
  const { status, device, time } = req.body;

  logWithCategory('info', LOG_CATEGORIES.API, 'Status update request', {
    ip: req.ip,
    hasStatus: status !== undefined,
    hasDevice: !!device,
    hasTime: !!time
  });

  if (status !== undefined) {
    currentStatus.status = status;
  }

  if (device && typeof device === 'object') {
    for (const [deviceKey, deviceData] of Object.entries(device)) {
      const existing = currentStatus.device[deviceKey] || {};
      currentStatus.device[deviceKey] = {
        ...existing,
        ...deviceData,
        time: time !== undefined ? time : new Date().toISOString()
      };
    }
  }

  currentStatus.last_updated = new Date().toISOString();
  sendSSEMessage(sseClients, 'update', currentStatus);

  logWithCategory('info', LOG_CATEGORIES.API, 'Status updated successfully', {
    newStatus: currentStatus.status,
    deviceCount: Object.keys(currentStatus.device).length
  });

  res.json({ success: true, message: 'Status updated' });
});

// API 端点：GET 获取/更新状态
app.get('/api/status', authenticateSetSecret, (req, res) => {
  const { status, device, time } = req.query;

  logWithCategory('info', LOG_CATEGORIES.API, 'Status GET request', {
    ip: req.ip,
    hasStatus: status !== undefined,
    hasDevice: device !== undefined,
    hasTime: time !== undefined
  });

  if (status !== undefined) {
    const parsedStatus = Number(status);
    if (!Number.isNaN(parsedStatus)) {
      currentStatus.status = parsedStatus;
    }
  }

  if (device !== undefined) {
    try {
      const deviceObj = JSON.parse(device);
      if (typeof deviceObj === 'object' && deviceObj !== null) {
        for (const [deviceKey, deviceData] of Object.entries(deviceObj)) {
          const existing = currentStatus.device[deviceKey] || {};
          currentStatus.device[deviceKey] = {
            ...existing,
            ...deviceData,
            time: time !== undefined ? time : new Date().toISOString()
          };
        }
      }
    } catch (e) {
      logWithCategory('error', LOG_CATEGORIES.API, 'Invalid device JSON in GET request', {
        error: e.message,
        deviceParam: device
      });
      return res.status(400).json({ error: 'Invalid device JSON format' });
    }
  }

  currentStatus.last_updated = new Date().toISOString();
  sendSSEMessage(sseClients, 'update', currentStatus);

  res.json(currentStatus);
});

// 健康检查接口
app.get('/health', (req, res) => {
  const healthData = {
    status: 'OK',
    connections: sseClients.size,
    timestamp: new Date().toISOString(),
    auth: {
      setSecretConfigured: !!SET_SECRET,
      getSecretConfigured: !!GET_SECRET
    },
    logging: {
      level: logger.level,
      transports: logger.transports.length
    }
  };
  
  res.json(healthData);
});

// 认证测试接口
app.get('/auth/test/get', authenticateGetSecret, (req, res) => {
  logWithCategory('info', LOG_CATEGORIES.AUTH, 'GET auth test successful', { ip: req.ip });
  res.json({ message: 'GET authentication successful', timestamp: new Date().toISOString() });
});

app.post('/auth/test/set', authenticateSetSecret, (req, res) => {
  logWithCategory('info', LOG_CATEGORIES.AUTH, 'SET auth test successful', { ip: req.ip });
  res.json({ message: 'SET authentication successful', timestamp: new Date().toISOString() });
});

// Express-Winston 错误日志记录
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

// 通用错误处理中间件
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
app.listen(PORT, () => {
  logWithCategory('info', LOG_CATEGORIES.SYSTEM, `Server started on port ${PORT}`, {
    port: PORT,
    setSecretConfigured: !!SET_SECRET,
    getSecretConfigured: !!GET_SECRET,
    logLevel: logger.level
  });
  sendHeartbeat();
});

// 优雅关闭
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

// 未处理的 Promise 拒绝
process.on('unhandledRejection', (reason, promise) => {
  logWithCategory('error', LOG_CATEGORIES.SYSTEM, 'Unhandled Rejection', {
    reason,
    promise
  });
});

module.exports = app;
