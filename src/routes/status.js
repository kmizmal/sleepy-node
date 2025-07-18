const express = require('express');
const router = express.Router();
const { logWithCategory } = require('../logger');
const { LOG_CATEGORIES } = require('../constants');
const { authenticateSetSecret, strictLimiter } = require('../middleware');
const { currentStatus, sendSSEMessage, sseClients } = require('../sse');

// 获取当前时间 ISO 字符串（默认值）
function getCurrentOrPassedTime(time) {
  return time !== undefined ? time : new Date().toISOString();
}

router.post('/', strictLimiter, authenticateSetSecret, (req, res) => {
  let { status, device, time, id, show_name, using, app_name } = req.body;
  const start = Date.now();

  const ip = req.ip;

  // 🚧 如果是旧结构（没有 status 和 device，但有 id 等字段），进行转换
  const isLegacy = status === undefined && device === undefined && id && app_name && typeof using === 'boolean';

  if (isLegacy) {
    status = using ? 1 : 0;
    device = {
      [id]: {
        using,
        app_name,
        show_name: show_name || id
      }
    };
  }

  // 🚨 依然无效，返回错误
  if (typeof status !== 'number' || typeof device !== 'object' || !device) {
    logWithCategory('warn', LOG_CATEGORIES.API, '无效请求参数', {
      ip,
      body: req.body
    });

    return res.status(400).json({
      success: false,
      code: 400,
      message: '请求参数不完整或格式错误'
    });
  }

  // ✅ 正常流程继续处理
  logWithCategory('info', LOG_CATEGORIES.API, 'Status update request', {
    ip,
    hasStatus: true,
    hasDevice: true,
    hasTime: !!time
  });

  currentStatus.status = status;

  try {
    for (const [deviceKey, deviceData] of Object.entries(device)) {
      const existing = currentStatus.device[deviceKey] || {};
      currentStatus.device[deviceKey] = {
        ...existing,
        ...deviceData,
        time: getCurrentOrPassedTime(time),
        show_name: deviceData.show_name || deviceKey || existing.show_name || 'Unknown'
      };
    }

    currentStatus.last_updated = new Date().toISOString();
    sendSSEMessage(sseClients, 'update', currentStatus);

    const duration = Date.now() - start;
    logWithCategory('info', LOG_CATEGORIES.API, 'Status updated successfully', {
      newStatus: currentStatus.status,
      deviceCount: Object.keys(currentStatus.device).length,
      duration: `${duration}ms`
    });

    return res.json({
      success: true,
      code: 200,
      message: '状态更新成功'
    });
  } catch (err) {
    logWithCategory('error', LOG_CATEGORIES.API, '状态更新失败', {
      error: err.message,
      stack: err.stack
    });

    return res.status(500).json({
      success: false,
      code: 500,
      message: '服务器内部错误'
    });
  }
});


// GET 获取/更新状态
router.get('/', authenticateSetSecret, (req, res) => {
  const { status, device, time } = req.query;

  let deviceObj = null;
  if (device !== undefined) {
    try {
      const decodedDevice = decodeURIComponent(device);
      deviceObj = JSON.parse(decodedDevice);
    } catch (e) {
      logWithCategory('error', LOG_CATEGORIES.API, 'Invalid device JSON in GET request', {
        error: e.message,
        deviceParam: device
      });
      return res.status(400).json({ error: 'Invalid device JSON format' });
    }
  }

  logWithCategory('info', LOG_CATEGORIES.API, 'Status GET request', {
    ip: req.ip,
    hasStatus: status !== undefined,
    hasDevice: !!deviceObj,
    hasTime: time !== undefined,
    device: deviceObj
  });

  if (status !== undefined) {
    const parsedStatus = Number(status);
    if (!Number.isNaN(parsedStatus)) {
      currentStatus.status = parsedStatus;
    }
  }

  if (deviceObj) {
    for (const [deviceKey, deviceData] of Object.entries(deviceObj)) {
      const existing = currentStatus.device[deviceKey] || {};
      currentStatus.device[deviceKey] = {
        ...existing,
        ...deviceData,
        time: getCurrentOrPassedTime(time),
        show_name: deviceData.show_name || deviceKey  || existing.show_name
      };
    }
  }

  currentStatus.last_updated = new Date().toISOString();
  sendSSEMessage(sseClients, 'update', currentStatus);

  res.json(currentStatus);
});

module.exports = router;
