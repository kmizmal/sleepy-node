// config.js
const path = require('path');
const fs = require('fs');
const { LOG_CATEGORIES } = require('./constants');
const { logWithCategory } = require('./logger');

// 加载环境变量
require('dotenv').config();

// 读取允许的跨域源
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

module.exports = {
  PORT: process.env.PORT || 3000,
  SET_SECRET: process.env.SECRET || 'default-set-secret',
  GET_SECRET: process.env.GET_SECRET || 'default-get-secret',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  allowedOrigins
};