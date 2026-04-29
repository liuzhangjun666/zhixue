# API 文档（最小版）

响应统一格式：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

`code = 0` 为成功；非 0 为失败。

鉴权相关统一错误格式：

```json
{ "code": 401, "message": "Unauthorized", "data": null }
```

```json
{ "code": 403, "message": "Forbidden", "data": null }
```

Token 签发说明：
- 令牌由 `AUTH_TOKEN_SECRET` 签名；
- 令牌包含过期时间 `exp`；
- 注册/登录成功响应包含：
  - `token`
  - `tokenExpiresIn`（秒）
  - `tokenExpiresAt`（ISO 时间）
- 生产环境必须显式配置 `AUTH_TOKEN_SECRET`，不得使用开发默认值。

验证码说明：
- 家长注册前先调用 `POST /api/auth/parent/send-code`；
- 老师注册前先调用 `POST /api/teacher/auth/send-code`；
- 注册接口必须提交 `code`；
- 开发环境会返回 `debugCode` 便于联调，生产环境不返回。

## 1) POST /api/auth/parent/send-code

- 需要 Token：否
- 用途：发送家长注册验证码

请求示例：

```json
{
  "phone": "13800138001"
}
```

成功返回示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "sent": true,
    "ttlSeconds": 300,
    "debugCode": "123456"
  }
}
```

主要错误场景：
- `400`：缺少手机号
- `500`：短信发送失败

## 2) POST /api/auth/parent/register

- 需要 Token：否
- 用途：家长注册并返回用户信息 + token

请求示例：

```json
{
  "phone": "13800138001",
  "password": "Pass1234",
  "nickname": "家长A",
  "code": "123456"
}
```

成功返回示例：

```json
{
  "code": 0,
  "message": "注册成功",
  "data": {
    "user": { "id": 101, "role": "parent", "nickname": "家长A", "phone": "13800138001" },
    "token": "...",
    "tokenExpiresIn": 604800,
    "tokenExpiresAt": "2026-05-06T12:00:00.000Z"
  }
}
```

主要错误场景：
- `400`：缺少必要字段或密码过短
- `400`：验证码错误或过期
- `409`：手机号已注册

## 3) POST /api/auth/parent/login

- 需要 Token：否
- 用途：家长登录

请求示例：

```json
{
  "phone": "13800138001",
  "password": "Pass1234"
}
```

成功返回示例：同注册返回结构。

主要错误场景：
- `400`：缺少手机号或密码
- `401`：手机号或密码错误

## 4) POST /api/teacher/auth/send-code

- 需要 Token：否
- 用途：发送老师注册验证码

请求示例：

```json
{
  "phone": "13900139001"
}
```

成功返回示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "sent": true,
    "ttlSeconds": 300,
    "debugCode": "123456"
  }
}
```

主要错误场景：
- `400`：缺少手机号
- `500`：短信发送失败

## 5) POST /api/auth/teacher/register

- 需要 Token：否
- 用途：老师注册/认证提交（最小字段）

请求示例：

```json
{
  "phone": "13900139001",
  "password": "Pass1234",
  "code": "123456",
  "nickname": "老师A",
  "subject": "数学",
  "experience": "3年"
}
```

成功返回示例：

```json
{
  "code": 0,
  "message": "注册成功",
  "data": {
    "user": { "id": 202, "role": "teacher", "nickname": "老师A", "phone": "13900139001" },
    "token": "...",
    "tokenExpiresIn": 604800,
    "tokenExpiresAt": "2026-05-06T12:00:00.000Z"
  }
}
```

主要错误场景：
- `400`：缺少必要字段或密码过短
- `400`：验证码错误或过期
- `409`：手机号已注册

## 6) POST /api/auth/teacher/login

- 需要 Token：否
- 用途：老师登录

请求示例：

```json
{
  "phone": "13900139001",
  "password": "Pass1234"
}
```

成功返回示例：同老师注册结构。

主要错误场景：
- `400`：缺少手机号或密码
- `401`：手机号或密码错误

## 7) GET /api/auth/me

- 需要 Token：是
- 用途：获取当前 token 对应用户

请求头：

```http
Authorization: Bearer <token>
```

成功返回示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": 1,
    "role": "parent",
    "nickname": "家长A",
    "phone": "13800138001",
    "city": "",
    "bio": "",
    "avatar": ""
  }
}
```

主要错误场景：
- `401`：token 缺失、非法或过期
- `404`：用户不存在

## 8) POST /api/auth/logout

- 需要 Token：是
- 用途：退出登录（后端返回成功标记，前端清本地 token）

成功返回示例：

```json
{
  "code": 0,
  "message": "退出成功",
  "data": { "success": true }
}
```

主要错误场景：
- `401`：未登录或 token 无效

## 9) GET /api/parent/profile

- 需要 Token：是（role=parent）
- 用途：获取当前家长资料

成功返回示例（节选）：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "parentName": "家长A",
    "phone": "13800138001",
    "children": []
  }
}
```

主要错误场景：
- `401`：未登录
- `403`：角色非家长

## 10) GET /api/teacher/profile

- 需要 Token：是（role=teacher）
- 用途：获取当前老师资料

成功返回示例（节选）：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "teacherName": "老师A",
    "phone": "13900139001",
    "preferredSubjects": ["数学"]
  }
}
```

主要错误场景：
- `401`：未登录
- `403`：角色非老师

## 11) GET /api/messages/conversations

- 需要 Token：是
- 用途：当前登录用户会话列表

成功返回示例（节选）：

```json
{
  "code": 0,
  "message": "ok",
  "data": [
    {
      "id": 1,
      "contactId": 2,
      "contactName": "张老师",
      "contactRole": "teacher",
      "lastMessage": "好的，我会准时上课的。",
      "updatedAt": "2026-04-20T10:30:00.000Z"
    }
  ]
}
```

主要错误场景：
- `401`：未登录

## 12) GET /api/messages/unread-count

- 需要 Token：是
- 用途：当前登录用户未读数

成功返回示例：

```json
{
  "code": 0,
  "message": "ok",
  "data": { "count": 3 }
}
```

主要错误场景：
- `401`：未登录

---

## 回归与验收

- 自动回归脚本：
  - `npm run smoke:auth`
  - `npm run smoke:core`
- 手工验收步骤：
  - [docs/QA.md](./QA.md)
