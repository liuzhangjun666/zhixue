# Vue 3 + Vite

This template should help get you started developing with Vue 3 in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about IDE Support for Vue in the [Vue Docs Scaling up Guide](https://vuejs.org/guide/scaling-up/tooling.html#ide-support).

## API 接入

1. 复制 `.env.example` 为 `.env`。
2. 配置 `VITE_API_BASE_URL` 为后端服务地址（例如 `http://localhost:8000`）。
3. 家长端 5 个模块的 API 映射集中在 `src/api/parent.ts` 的 `ENDPOINTS` 常量中，可按后端实际路由修改。

## 本地后端（已生成）

1. 启动后端：`npm run api:dev`（默认 `http://localhost:8000`）。
2. 启动前端：`npm run dev`（默认 `http://localhost:5173`）。
3. 后端数据文件：`server/data/db.json`，所有写操作会落盘到该文件。

### 已提供接口

- `GET /api/health`
- `GET /api/parent/profile`
- `PUT /api/parent/profile`
- `GET /api/parent/requests`
- `PATCH /api/parent/requests/:id/status`
- `GET /api/parent/reviews`
- `POST /api/parent/reviews/:id/reply`
- `GET /api/membership/status`
- `GET /api/membership/plans?role=parent`
- `POST /api/membership/subscribe`
- `GET /api/parent/settings`
- `PUT /api/parent/settings/password`
- `PUT /api/parent/settings/notifications`
- `PUT /api/parent/settings/privacy`
- `POST /api/parent/settings/deactivate`
