const express = require('express');
const router = express.Router();
const { logWithCategory } = require('../logger');
const { LOG_CATEGORIES } = require('../constants');
const { authenticateSetSecret, strictLimiter } = require('../middleware');
const { currentStatus, sendSSEMessage, sseClients } = require('../sse');

function getCurrentOrPassedTime(time) {
  return time !== undefined ? time : new Date().toISOString();
}
function updateDeviceStatus(deviceObj, time) {
  for (const [deviceKey, deviceData] of Object.entries(deviceObj)) {
    const existing = currentStatus.device[deviceKey] || {};
    currentStatus.device[deviceKey] = {
      ...existing,
      ...deviceData,
      time: getCurrentOrPassedTime(time),
      show_name: deviceData.show_name || existing.show_name || deviceKey || 'Unknown'
    };
  }

  currentStatus.last_updated = new Date().toISOString();
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
    updateDeviceStatus(device, time);

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


router.get('/', authenticateSetSecret, (req, res) => {
  const { status, device, time, redirect_to_post } = req.query;

  // 🔄 如果请求包含 redirect_to_post 参数，重定向到 POST 路由
  if (redirect_to_post === 'true') {
    logWithCategory('info', LOG_CATEGORIES.API, 'GET request redirecting to POST', {
      ip: req.ip,
      query: req.query
    });

    return res.status(307).json({
      success: false,
      code: 307,
      message: '请使用 POST 方法进行状态更新',
      redirect: {
        method: 'POST',
        url: req.originalUrl.split('?')[0], // 移除查询参数
        body_format: {
          status: 'number (0 or 1)',
          device: 'object with device data',
          time: 'ISO string (optional)'
        }
      }
    });
  }

  const hasUpdateParams = status !== undefined || device !== undefined;
  if (hasUpdateParams) {
    logWithCategory('info', LOG_CATEGORIES.API, 'GET request with update parameters - suggesting POST', {
      ip: req.ip,
      hasStatus: status !== undefined,
      hasDevice: device !== undefined
    });
  }

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
      return res.status(400).json({
        error: 'Invalid device JSON format',
        suggestion: 'Consider using POST method for complex device updates'
      });
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
    updateDeviceStatus(deviceObj, time);
  }

  currentStatus.last_updated = new Date().toISOString();
  sendSSEMessage(sseClients, 'update', currentStatus);

  // 🔗 在响应中包含 POST 路由参考信息
  const response = {
    ...currentStatus,
    _meta: {
      last_updated: currentStatus.last_updated,
      ...(hasUpdateParams && {
        post_method_info: {
          message: '对于复杂的状态更新，建议使用 POST 方法',
          url: req.originalUrl.split('?')[0],
          method: 'POST',
          content_type: 'application/json',
          example_body: {
            status: 1,
            device: {
              "device_id": {
                using: true,
                app_name: "示例应用",
                show_name: "设备显示名称"
              }
            },
            time: new Date().toISOString()
          }
        }
      })
    }
  };

  res.json(response);
});

module.exports = router;
