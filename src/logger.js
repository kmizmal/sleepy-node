// logger.js
const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');
const { getCategoryIcon } = require('./constants');

// 创建日志目录
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// 创建日志记录器
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, category, metadata, stack }) => {
      const icon = getCategoryIcon(category);
      const metaStr = metadata ? ` | ${JSON.stringify(metadata)}` : '';
      const stackStr = stack ? `\n${stack}` : '';
      return `[${timestamp}] ${icon} ${level.toUpperCase()}:${category || 'GENERAL'} - ${message}${metaStr}${stackStr}`;
    })
  ),
  defaultMeta: { service: 'express-server' },
  transports: [
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
    new winston.transports.File({
      filename: path.join(logsDir, 'app.log'),
      maxsize: 5242880,
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),
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

module.exports = {
  logger,
  logWithCategory
};