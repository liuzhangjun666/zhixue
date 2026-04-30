# 知学空间

一个最小可运行的家长/老师撮合平台示例，包含前端、后端、实时消息和基于 Bearer Token 的认证链路。

## 技术栈

- 前端：Vue 3 + Vite + Vue Router
- 后端：Express
- 数据库：MySQL（`mysql2`）
- 实时通信：Socket.IO
- 认证：Bearer Token（`Authorization: Bearer <token>`）

## 环境变量

### 前端（`.env`）

- `VITE_API_BASE_URL`：后端 API 基础地址（例如 `http://localhost:8000`）

### 后端（启动 `node server/src/index.js` 时读取）

- `PORT`：后端端口（默认 `8000`）
- `CORS_ORIGINS`：允许跨域来源，逗号分隔（默认 `http://localhost:5173,http://127.0.0.1:5173`）
- `DB_HOST`：MySQL 地址（默认 `localhost`）
- `DB_PORT`：MySQL 端口（默认 `3306`）
- `DB_USER`：MySQL 用户（默认 `root`）
- `DB_PASSWORD`：MySQL 密码（默认 `123456`）
- `DB_NAME`：数据库名（默认 `zhixue`）
- `AUTH_TOKEN_SECRET`：Token 签名密钥（开发默认 `zhixue-dev-secret-change-me`）
- `AUTH_TOKEN_EXPIRES_IN_SECONDS`：Token 有效期秒数（默认 `604800`，即 7 天）
- `SMS_PROVIDER`：短信发送模式（`mock`/`webhook`，默认 `mock`）
- `SMS_WEBHOOK_URL`：短信网关中转地址（`SMS_PROVIDER=webhook` 时必填）
- `SMS_WEBHOOK_TOKEN`：短信网关鉴权 Token（可选）
- `SMS_SIGN_NAME`：短信签名（默认 `知学空间`）
- `SMS_VERIFY_TEMPLATE`：验证码模板标识（默认 `VERIFY_CODE`）
- `SMS_RENEW_TEMPLATE`：续费提醒模板标识（默认 `AUTO_RENEW_REMINDER`）
- `SMS_TIMEOUT_MS`：短信请求超时毫秒数（默认 `5000`）
- `CURRENT_POLICY_VERSION`：注册同意记录版本（默认 `2026-04-30`）
- `MESSAGE_MAX_LENGTH`：单条消息最大长度（默认 `1000`）
- `MESSAGE_RATE_LIMIT_WINDOW_MS` / `MESSAGE_RATE_LIMIT_MAX`：消息发送限流窗口与阈值
- `MESSAGE_SENSITIVE_WORDS`：敏感词列表（逗号分隔）
- `AUTH_SEND_CODE_WINDOW_MS` / `AUTH_SEND_CODE_MAX`：验证码接口限流窗口与阈值
- `AUTH_LOGIN_WINDOW_MS` / `AUTH_LOGIN_MAX`：登录接口请求限流窗口与阈值
- `AUTH_LOGIN_FAIL_WINDOW_MS` / `AUTH_LOGIN_FAIL_MAX`：登录失败惩罚窗口与阈值
- `ADMIN_REVIEW_TOKEN`：审核后台接口访问令牌（通过 `x-admin-review-token` 请求头传递）
- `RETENTION_JOB_ENABLED`：是否启用服务内定时留存任务（默认 `true`）
- `RETENTION_JOB_INTERVAL_MS`：留存任务间隔毫秒（默认 `43200000`，即 12 小时）
- `RETENTION_MESSAGE_ARCHIVE_AFTER_DAYS`：消息归档阈值天数（默认 `180`）
- `RETENTION_MESSAGE_DELETE_AFTER_DAYS`：消息删除阈值天数（默认 `365`）
- `RETENTION_AUDIT_LOG_RETENTION_DAYS`：审计日志保留天数（默认 `365`）
- `RETENTION_COMPLAINT_RETENTION_DAYS`：已结案举报保留天数（默认 `730`）

> 生产环境要求：必须显式配置 `AUTH_TOKEN_SECRET`，且不能使用开发默认值；否则后端会拒绝启动。

## 本地启动流程

1. 安装依赖

```bash
npm install
```

2. 初始化数据库（执行 `server/src/schema.sql`）

```bash
node server/src/init-db.js
```

3. 执行兼容迁移（给旧库补字段，不删数据）

```bash
npm run api:migrate:compat
```

如需手动执行一次留存归档/清理任务：

```bash
npm run retention:run
```

4. 启动后端

```bash
npm run api:dev
```

5. 启动前端

```bash
npm run dev
```

6. 构建前端

```bash
npm run build
```

## 认证流程

1. 家长注册/登录：
- `POST /api/auth/parent/send-code`
- `POST /api/auth/parent/register`
- `POST /api/auth/parent/login`

2. 老师注册/登录：
- `POST /api/teacher/auth/send-code`
- `POST /api/auth/teacher/register`
- `POST /api/auth/teacher/login`

3. 登录成功后前端将 `token`、`user` 存入 `localStorage`：
- `zhixue_auth_token`
- `zhixue_auth_user`

4. 前端请求由 `src/api/http.ts` 自动附加：
- `Authorization: Bearer <token>`

5. 后端通过 `authRequired` 中间件解析 token，注入 `req.user`。

6. Token 过期策略：
- 令牌包含 `exp`（Unix 秒级时间戳）；
- 登录/注册响应同时返回：
  - `tokenExpiresIn`（秒）
  - `tokenExpiresAt`（ISO 时间）

7. 统一鉴权错误格式：

```json
{ "code": 401, "message": "Unauthorized", "data": null }
```

```json
{ "code": 403, "message": "Forbidden", "data": null }
```

8. 验证码注册规则（最小实现）：
- 家长注册 `POST /api/auth/parent/register` 需要 `code` 字段；
- 老师注册 `POST /api/auth/teacher/register` 需要 `code` 字段；
- 开发环境 `send-code` 响应会返回 `debugCode` 便于本地联调；生产环境不返回。

9. 自动续费短信提醒：
- 勾选“开通后自动续费”后，后端会在会员到期前 24 小时触发短信提醒；
- 提醒任务每 10 分钟扫描一次，发送成功后会记录并避免重复发送；
- 在 `SMS_PROVIDER=mock` 下，短信内容只写入后端日志。

## 常用 API 简表

| Method | Path | 说明 | 需要 Token |
|---|---|---|---|
| POST | `/api/auth/parent/send-code` | 家长发送验证码 | 否 |
| POST | `/api/auth/parent/register` | 家长注册 | 否 |
| POST | `/api/auth/parent/login` | 家长登录 | 否 |
| POST | `/api/teacher/auth/send-code` | 老师发送验证码 | 否 |
| POST | `/api/auth/teacher/register` | 老师注册/认证提交 | 否 |
| POST | `/api/auth/teacher/login` | 老师登录 | 否 |
| GET | `/api/auth/me` | 获取当前用户 | 是 |
| POST | `/api/auth/logout` | 退出登录 | 是 |
| GET | `/api/parent/profile` | 家长资料 | 是（家长） |
| GET | `/api/teacher/profile` | 老师资料 | 是（老师） |
| GET | `/api/messages/conversations` | 会话列表 | 是 |
| GET | `/api/messages/unread-count` | 未读数 | 是 |
| POST | `/api/reports/messages/:messageId` | 提交消息举报 | 是 |
| GET | `/api/reports/mine` | 我的举报记录 | 是 |
| GET | `/api/admin/reports/review-queue` | 举报审核队列（需 `x-admin-review-token`） | 否（管理员令牌） |
| PATCH | `/api/admin/reports/:id/review` | 审核处置举报（含禁言/封禁） | 否（管理员令牌） |
| GET | `/api/admin/restrictions` | 查看用户限制记录 | 否（管理员令牌） |
| POST | `/api/admin/restrictions/:id/release` | 解除限制 | 否（管理员令牌） |
| GET | `/api/membership/status` | 当前会员状态 | 是 |
| GET | `/api/membership/plans` | 会员套餐列表 | 否 |

详细 API 示例见：[`docs/API.md`](./docs/API.md)
手工验收步骤见：[`docs/QA.md`](./docs/QA.md)

## 最小回归校验

### 自动 smoke 脚本

脚本位置：`server/scripts/smoke-auth.js`

默认访问 `http://localhost:8000`，会验证：

1. 家长注册
2. 家长登录
3. `GET /api/auth/me`
4. `GET /api/parent/profile`
5. 老师注册
6. 老师登录
7. `GET /api/auth/me`
8. `GET /api/teacher/profile`

运行命令：

```bash
npm run smoke:auth
```

如后端非 `8000` 端口，可指定：

```bash
$env:API_BASE_URL='http://localhost:8001'
npm run smoke:auth
```

### 核心权限回归（smoke:core）

脚本位置：`server/scripts/smoke-core.js`

覆盖：
- parent/teacher 注册登录与 `me/profile`
- parent 创建 request、获取列表、获取详情
- 未登录访问受保护接口返回 401
- 角色越权访问返回 403

运行命令：

```bash
npm run smoke:core
```
