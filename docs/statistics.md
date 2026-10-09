# 全站统计

页脚显示「累计访问 × 次 · 累计导出 × 次」。数据由所有连接到同一 API 的网页汇总，保存到 SQLite；服务重启或更新容器后继续累计。

## 计数口径

- 每次打开或刷新页面上报一次访问。同一次页面加载使用固定事件 ID，React StrictMode 和请求重试共用此 ID。
- 图片生成并触发下载，或成功写入图片剪贴板后，上报一次导出。同一作品多次下载、复制分别计数。
- 调整排版、裁剪、实时预览、AI 底图下载以及 AstrBot 调用不计入网页成品导出量。
- 统计从数据库创建时开始，累计成功接收的事件。数据库仅保存事件 ID、事件类型、时间及总数。

前端上报遇到网络或服务端临时错误时重试一次，使用相同事件 ID。未确认的页面访问会在后续刷新统计时继续重试；导出上报最终失败后不进入离线队列。统计请求独立于制图，页面显示最近一次取得的累计值，首次读取失败时显示「统计暂不可用」。页面可见时每 30 秒刷新一次，回到页面时也会刷新。

## 本地运行

服务端使用 Node.js 22.13+，前端环境要求见项目 README。推荐通过 Docker 运行服务：

```sh
docker compose --env-file .env.api up -d --build
npm run dev
```

首次运行按照 [API 文档](api.md#docker-compose) 配置 `.env.api`。统计接口无需前端填写 API Key；图片 API 继续使用服务端密钥。

Vite 将 `/api/v1/stats` 及其子路径代理到 `http://127.0.0.1:8787`。需要不同端口时，在 `.env.development.local` 设置：

```dotenv
STATS_PROXY_TARGET=http://127.0.0.1:8790
```

服务端的 `STATS_ALLOWED_ORIGINS` 默认允许 localhost 和 127.0.0.1 的 5173、5174 端口。使用其他页面地址时，将对应 Origin 加入此配置。

## 持久化

本机直接运行 API 时，数据库默认位于 `data/stats.sqlite`，也可通过 `STATS_DB_PATH` 指定路径。Docker Compose 将 `stats-data` 卷挂载到 `/app/data`。数据库目录已加入 Git 与 Docker 构建忽略列表。

更新镜像时保留数据卷即可继续累计。备份时停止服务后复制整个数据目录，再启动服务；`docker compose down -v` 会删除统计卷和其中的数据。

## 接口

`GET /api/v1/stats` 无需认证，返回：

```json
{ "visits": 1234, "exports": 567, "startedAt": "2026-10-09T00:00:00.000Z" }
```

`POST /api/v1/stats/events` 需要 `Content-Type: application/json` 和允许的网站 `Origin`，正文仅含：

```json
{ "id": "43214d24-4d50-4c35-88cf-558a6d6be1d3", "kind": "export" }
```

`id` 为 UUID v4，`kind` 为 `page_view` 或 `export`。首次接收事务性写入事件并增加计数，相同 ID 再次上报返回当前累计值。去重记录随数据库持久保存。

统计接口支持 CORS 预检，默认按直接连接地址限流至每分钟 120 次，返回 `429` 与 `Retry-After`。配置项为 `STATS_RATE_LIMIT_PER_MINUTE`。使用反向代理时，同一代理连接地址共享此额度，公网入口应在代理层按访客地址限流，并按流量调整服务端额度。

## 静态站点配置

生产构建只有配置 `VITE_STATS_API_URL` 后才启用统计展示和上报。例如：

```sh
VITE_STATS_API_URL='https://your-api.example/api/v1/stats' npm run build
```

同时将网站 Origin 加入 API 的 `STATS_ALLOWED_ORIGINS`。GitHub Pages 可在构建环境中注入此变量。该变量是公开接口地址，图片服务的私密 API Key 留在服务端。

## 集成检查

在 Node.js 22.13+ 环境下运行：

```sh
node scripts/check-stats.mjs
```

脚本启动独立 API 和临时数据库，检查并发计数、事件去重、Origin 与输入校验、限流和重启持久化，并运行已有图片 API 检查。运行结束自动清理临时数据，不修改正常服务的统计值。
