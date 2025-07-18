// sse.js
const { logWithCategory } = require('./logger');
const { LOG_CATEGORIES } = require('./constants');

// 状态对象
let currentStatus = {
  status: 0,
  device: {
    // 示例设备数据
    // "pc": {
    //   "using": true,
    //   "app_name": "微信",
    //   "show_name": "pc",
    //   "time": "2025-07-17T10:00:00.000Z"
    // }
  },
  last_updated: new Date().toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' }),
};

const sseClients = new Set();

// 发送SSE消息
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
  
  if (event !== 'heartbeat') {
    logWithCategory('debug', LOG_CATEGORIES.SSE, 'SSE message sent', {
      event,
      successCount,
      errorCount,
      totalClients: clients.size
    });
  }
}

// 心跳保持连接
function sendHeartbeat() {
  setInterval(() => {
    const now = new Date().toISOString();
    if (sseClients.size > 0) {
      sendSSEMessage(sseClients, 'heartbeat', now);
    }
  }, 30000);
}

module.exports = {
  currentStatus,
  sseClients,
  sendSSEMessage,
  sendHeartbeat
};