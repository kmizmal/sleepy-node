> 欢迎来到 Sleepy-node 的后端项目

一个用于 ~~*视奸*~~ 查看个人在线状态 (以及正在使用软件) 的 Flask 应用，让他人能知道你不在而不是故意吊他/她

- [功能](#功能)
- [Preview](#preview)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [前端](#前端)
- [配置说明](#配置说明)
- [启动服务](#启动服务)
- [API 路由说明](#api-路由说明)
- [日志说明](#日志说明)
- [进程管理](#进程管理)
- [贡献指南](#贡献指南)
- [相关项目](#相关项目)


##  功能

* RESTful API 接口（状态查询、身份验证、事件推送等）
* Server-Sent Events (SSE) 实时事件推送支持
* 灵活的跨域（CORS）策略，允许指定域名访问
* 详细的请求和错误日志，方便排查与监控
* 进程优雅关闭和异常捕获机制，保证稳定运行
  
## Preview
个人站点: [sleepy.zmal.top](https://sleepy.zmal.top)

---

## 环境要求

* Node.js 14 及以上版本
* npm,pnpm 或 yarn 包管理器

---

## 快速开始

```bash
git clone https://github.com/kmizmal/sleepy-node
cd sleepy-node
mv .env.example .env
pnpm install
pnpm start
```

[前端](https://github.com/kmizmal/Sleepy-Web)
---

## 配置说明

在项目根目录创建 `.env` 文件，配置如下变量：

```env
PORT=3000                  # 服务监听端口，默认3000
SECRET=zmal                # SET_SECRET，设置用的密钥
GET_SECRET=zmal_get        # GET_SECRET，获取用的密钥
LOG_LEVEL=info             # 日志级别，默认 info
```

**allowedOrigins.json**

```json
[
  "http://localhost:3000",
  "http://127.0.0.1:5500"
]
```

---

## 启动服务

```bash
pnpm start
```

默认监听 `.env` 中配置的端口。

---

## API 路由说明

| 路径          | 功能说明         | 请求方式 |
| ------------- | ---------------- | -------- |
| `/api/status` | 状态设置         | POST/GET |
| `/events`     | SSE 实时事件推送 | GET      |
| `/health`     | 健康检查         | GET      |

---

## 日志说明

* 使用 [winston](https://github.com/winstonjs/winston) 进行日志记录
* 请求日志包含请求方法、路径、响应状态和耗时，排除 `/health` 和 `/events` 路由
* 错误日志记录异常详细信息及请求上下文
* 日志按分类（API、系统、CORS、SSE）分组，方便分析

---

## 进程管理

* 支持优雅关闭（监听 SIGTERM 信号，关闭 SSE 连接后退出）
* 捕获未处理的异常和 Promise 拒绝，防止服务崩溃

---

## 贡献指南

欢迎提交 Issue 和 Pull Request

## 相关项目
- https://github.com/kmizmal/Sleepy-Web
- https://github.com/kmizmal/Sleepy-Android
- https://github.com/kmizmal/Sleepy-Windows
- https://github.com/sleepy-project/sleepy

---
