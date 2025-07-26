const express = require('express');
const router = express.Router();
const { logWithCategory } = require('../logger');
const { LOG_CATEGORIES } = require('../constants');
const { authenticateSetSecret, strictLimiter } = require('../middleware');
const { currentStatus, sendSSEMessage, sseClients } = require('../sse');

// ========= 工具函数 =========
function getCurrentOrPassedTime(time) {
  const parsed = Date.parse(time);
  return !isNaN(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function parseDeviceParam(raw) {
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(decodeURIComponent(raw));
    } catch (err) {
      return { _parseError: err.message };
    }
  }
}

function updateDeviceStatus(deviceObj, time) {
  for (const [deviceKey, deviceData] of Object.entries(deviceObj)) {
    const existing = currentStatus.device[deviceKey] || {};
    currentStatus.device[deviceKey] = {
      ...existing,
      ...deviceData,
      time: getCurrentOrPassedTime(time),
      media: deviceData.media,
      media_content: deviceData.media_content,
      show_name: deviceData.show_name || existing.show_name || deviceKey || 'Unknown'
    };
  }
}

function applyStatusAndDeviceUpdate(status, deviceObj, time) {
  if (typeof status === 'number') {
    currentStatus.status = status;
  }

  if (deviceObj && typeof deviceObj === 'object') {
    updateDeviceStatus(deviceObj, time);
  }

  currentStatus.last_updated = new Date().toISOString();
  sendSSEMessage(sseClients, 'update', currentStatus);
}

// ========= POST 路由 =========

router.post('/', strictLimiter, authenticateSetSecret, (req, res) => {
  let { status, device, time, id, show_name, using, app_name,media,media_content } = req.body;
  const start = Date.now();
  const ip = req.ip;

  const isLegacy = status === undefined && device === undefined && id && app_name && typeof using === 'boolean';
  if (isLegacy) {
    status = status || using ? 0 : 1;
    device = {
      [id]: {
        using,
        app_name,
        show_name: show_name || id,
        media: media || media_content?true:false,
        media_content
      }
    };
  }

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

  logWithCategory('info', LOG_CATEGORIES.API, 'Status update request', {
    ip,
    hasStatus: true,
    hasDevice: true,
    hasTime: !!time
  });

  try {
    applyStatusAndDeviceUpdate(status, device, time);

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

// ========= GET 路由 =========

router.get('/', authenticateSetSecret, (req, res) => {
  const { status, device, time, redirect_to_post } = req.query;

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
        url: req.originalUrl.split('?')[0],
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
    const parsed = parseDeviceParam(device);
    if (parsed?._parseError) {
      logWithCategory('error', LOG_CATEGORIES.API, 'Invalid device JSON in GET request', {
        error: parsed._parseError,
        deviceParam: device
      });

      return res.status(400).json({
        error: 'device 参数格式不合法',
        detail: parsed._parseError,
        suggestion: '请使用标准 JSON 格式，或使用 POST 方法提交复杂结构'
      });
    }

    deviceObj = parsed;
  }

  logWithCategory('info', LOG_CATEGORIES.API, 'Status GET request', {
    ip: req.ip,
    hasStatus: status !== undefined,
    hasDevice: !!deviceObj,
    hasTime: time !== undefined,
    device: deviceObj
  });

  const parsedStatus = Number(status);
  applyStatusAndDeviceUpdate(!Number.isNaN(parsedStatus) ? parsedStatus : undefined, deviceObj, time);

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
            status: 0,
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
