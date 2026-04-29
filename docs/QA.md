# 手工验收清单（QA）

## 验收前准备

1. 启动 MySQL，并完成：
- `node server/src/init-db.js`
- `npm run api:migrate:compat`
2. 启动后端：`npm run api:dev`
3. 启动前端：`npm run dev`
4. 浏览器打开前端地址（默认 `http://localhost:5173`）。

## 一、家长链路

1. 打开 `/register`，完成家长注册。
2. 注册成功后应跳转 `/parent-center`，浏览器 localStorage 应存在：
- `zhixue_auth_token`
- `zhixue_auth_user`
3. 在家长中心进入“我的请求”：
- 新建一条请求成功；
- 列表可见新请求；
- 点击“查看详情”进入 `/parent/requests/:id`。
4. 在请求详情页检查：
- 标题、科目、年级、状态、创建时间可展示；
- 点击“返回列表”可回到请求列表页。
5. 打开 `/parent/edit`（或页面触发 profile 请求）应返回当前家长数据。
6. 点击退出登录后，访问 `/parent-center` 应被重定向到 `/login`。

## 二、老师链路

1. 打开 `/teacher-auth`：
- 切换到“已有账号登录”模式；
- 使用老师账号登录。
2. 登录成功后应跳转 `/teacher-center`，localStorage 存在 token/user。
3. 访问老师资料页面（编辑资料页）应能拉取 `/api/teacher/profile`。
4. 退出登录后访问 `/teacher-center`，应被重定向回 `/teacher-auth`。

## 三、消息链路（最小）

1. 家长或老师登录后进入 `/messages`。
2. 会话列表请求应成功：
- `GET /api/messages/conversations`
- `GET /api/messages/unread-count`
3. 在聊天页发送消息时，Socket 连接应建立成功（携带 token）。
4. 清空 localStorage token 后刷新 `/messages`：
- 页面应回到登录页（家长默认 `/login`，老师 `/teacher-auth`）；
- 受保护接口返回 `401 Unauthorized`。

## 四、鉴权错误格式验收

使用 Postman 或 curl 验证：

1. 无 token 请求 `GET /api/auth/me`：
- 状态码 `401`
- 返回体：
```json
{ "code": 401, "message": "Unauthorized", "data": null }
```

2. 老师 token 请求 `GET /api/parent/profile`：
- 状态码 `403`
- 返回体：
```json
{ "code": 403, "message": "Forbidden", "data": null }
```

3. 家长 token 请求 `GET /api/teacher/profile`：
- 状态码 `403`
- 返回体同上。
