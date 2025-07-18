const winston = require('winston');
const path = require('path');
const fs = require('fs');
const { getCategoryIcon } = require('./constants');

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

function formatLog({ timestamp, level, message, category, metadata, stack }, useColor = false) {
  const icon = getCategoryIcon(category);
  const metaStr = metadata && Object.keys(metadata).length ? ` | ${JSON.stringify(metadata)}` : '';
  const stackStr = stack ? `\n${stack}` : '';
  const lvl = useColor ? level : level.toUpperCase();
  return `[${timestamp}] ${icon} ${lvl}:${category || 'GENERAL'} - ${message}${metaStr}${stackStr}`;
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(info => formatLog(info))
  ),
  defaultMeta: { service: 'express-server' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(info => formatLog(info, true))
      )
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'app.log'),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ]
});

function logWithCategory(level, category, message, metadata = {}) {
  logger.log(level, message, { category, metadata });
}

module.exports = { logger, logWithCategory };
