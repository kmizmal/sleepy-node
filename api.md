# 📘 API 文档

服务地址示例：`http://localhost:3000`

---

## 🛡️ 认证接口（/auth）

用于验证访问权限，通过设置的 `GET_SECRET` 和 `SET_SECRET` 控制访问权限。

### ✅ `GET /auth/test/get`

**说明**：用于测试 `GET_SECRET` 密钥的访问是否成功。

* 🔐 认证方式：需携带 `?secret=xxx` 参数（值为 GET\_SECRET）

**示例请求**：

```
GET /auth/test/get?secret=zmal_get
```

**响应示例**：

```json
{
  "message": "GET authentication successful",
  "timestamp": "2025-07-17T10:00:00.000Z"
}
```

---

### ✅ `POST /auth/test/set`

**说明**：用于测试 `SET_SECRET` 密钥的访问是否成功。

* 🔐 认证方式：需在请求体或查询参数中提供 `secret=xxx`（值为 SET\_SECRET）

**示例请求**：

```http
POST /auth/test/set
Content-Type: application/json

{
  "secret": "zmal"
}
```

**响应示例**：

```json
{
  "message": "SET authentication successful",
  "timestamp": "2025-07-17T10:00:00.000Z"
}
```

---

## 📡 状态接口（/api/status）

状态数据将被保存在内存对象 `currentStatus` 中，支持查询和更新操作。

### ✅ `GET /api/status`

**说明**：获取当前状态，并可通过 query 参数更新状态。

* 🔐 需要 `SET_SECRET`
* 参数（可选）：

  * `status`：数字，更新状态值
  * `device`：URL编码的 JSON 对象，更新设备状态
  * `time`：ISO 时间字符串（可选）

**示例**：

```http
GET /api/status?secret=zmal&status=1&device=%7B%22pc%22%3A%7B%22using%22%3Atrue%7D%7D
```

**响应**（示例）：

```json
{
  "status": 1,
  "device": {
    "pc": {
      "using": true,
      "app_name": "微信",
      "show_name": "pc",
      "time": "2025-07-17T10:00:00.000Z"
    }
  },
  "last_updated": "2025-07-17T10:00:01.000Z"
}
```
> 项目中全部`time`，`last_updated`均使用标准 UTC ISO 时间
---

### ✅ `POST /api/status`

**说明**：以 POST 方式更新状态。

* 🔐 需要 `SET_SECRET`
* Content-Type: `application/json`
* 请求体字段：

  * `status`: 数字
  * `device`: JSON 对象，多个设备状态
  * `time`: 时间戳（可选）

**示例请求**：

```json
{
  "secret": "zmal",
  "status": 2,
  "device": {
    "ace3": {
      "using": true,
      "app_name": "微信"
    }
  }
}
```

**响应示例**：

```json
{
  "success": true,
  "message": "Status updated"
}
```

---

## 🔁 实时事件接口（/events）

通过 Server-Sent Events 推送实时状态更新。

### ✅ `GET /events`

**说明**：建立一个 SSE 连接，监听 `update` 类型事件。

* 🔐 需要 `GET_SECRET`
* 需设置 `Accept: text/event-stream`
* 支持跨域（但仅允许 `allowedOrigins.json` 中的域名）

**示例响应**（事件格式）：

```
event: update
data: {"status":1,"device":{"pc":{"using":true}}}
```

连接关闭后客户端可选择重连。

---

## ❤️ 健康检查（/health）

### ✅ `GET /health`

**说明**：检查系统运行状态和配置信息。

**响应示例**：

```json
{
  "status": "OK",
  "connections": 1,
  "timestamp": "2025-07-17T10:00:00.000Z",
  "auth": {
    "setSecretConfigured": true,
    "getSecretConfigured": true
  },
  "logging": {
    "level": "info",
    "transports": 2
  }
}
```

---

## 🔒 认证方式总结

| 接口路径             | 方法   | 认证方式                             |
| ---------------- | ---- | -------------------------------- |
| `/auth/test/get` | GET  | `?secret=GET_SECRET`             |
| `/auth/test/set` | POST | Body 或 URL 中 `secret=SET_SECRET` |
| `/api/status`    | GET  | `?secret=SET_SECRET`             |
| `/api/status`    | POST | JSON 中 `secret=SET_SECRET`       |
| `/events`        | GET  | `?secret=GET_SECRET`             |

