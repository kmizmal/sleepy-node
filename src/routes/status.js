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

// POST 更新状态
router.post('/', strictLimiter, authenticateSetSecret, (req, res) => {
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
        time: getCurrentOrPassedTime(time),
        show_name: deviceData.show_name || deviceKey  || existing.show_name
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
