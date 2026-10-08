# 表情图片服务

通过 HTTP 提交底图 ID、文案和样式，服务返回一张 1024 × 1024 PNG。图片在服务端合成后直接响应，不保存生成结果。适合由 AstrBot 等程序调用，将返回的图片字节发送到聊天中。

## 启动

在项目根目录使用 Node.js 20.19+ 或 22.12+：

```sh
npm ci
API_KEY='replace-with-your-key' npm run api
```

服务默认监听 `http://127.0.0.1:8787`。`API_KEY` 必填，调用方使用相同的值进行 Bearer 认证。检查 API 的 TypeScript 类型可运行：

```sh
npm run check:api
```

### Docker Compose

仓库根目录包含 `Dockerfile`、`compose.yaml` 和环境变量示例：

```sh
cp .env.api.example .env.api
# Set API_KEY in .env.api before starting the service.
docker compose --env-file .env.api up -d --build
```

Docker 使用 Node.js 22。Compose 默认将服务端口映射到主机的 `127.0.0.1:8787`，可用 `API_PORT` 修改主机端口；容器内监听 `0.0.0.0:8787`。

### 环境变量

| 变量 | 默认值 | 含义 |
| --- | --- | --- |
| `API_KEY` | 必填 | 接口访问密钥 |
| `HOST` | `127.0.0.1` | 监听地址；容器内使用 `0.0.0.0` |
| `PORT` | `8787` | Node.js 服务监听端口 |
| `API_PORT` | `8787` | Compose 映射到主机的端口，区别于容器内的 `PORT` |
| `MAX_CONCURRENT_RENDERS` | `2` | 同时处理的渲染请求上限 |
| `RATE_LIMIT_PER_MINUTE` | `60` | 全服务共用的每分钟渲染请求上限 |

## 自测

服务启动后，在项目根目录运行以下命令。直接启动的服务和容器服务均适用：

```sh
API_KEY='replace-with-your-key' npm run smoke:api
```

命令通过真实 HTTP 请求检查接口并验证返回的 PNG，保存样图和报告。`API_KEY` 必填，并与服务一致；`API_BASE_URL` 默认是 `http://127.0.0.1:8787`，`API_SMOKE_OUTPUT` 默认是 `.preview/api-smoke`，可通过环境变量调整。

## 接口

除 `GET /healthz` 外，所有接口都要求请求头 `Authorization: Bearer <API_KEY>`。

| 方法与路径 | 返回内容 |
| --- | --- |
| `GET /healthz` | 服务健康状态，无需认证 |
| `GET /api/v1/stickers` | JSON：`{ "stickers": [...] }`，每项包含 `id`、`name`、`origin`、`tags`、`animated`、`featured` |
| `GET /api/v1/fonts` | JSON：`{ "fonts": [...] }`，每项包含 `id`、`name` |
| `POST /api/v1/render` | `image/png` 二进制图片 |

在另一终端设置与服务一致的密钥，即可查询素材和字体：

```sh
export API_KEY='replace-with-your-key'

curl --fail --silent --show-error http://127.0.0.1:8787/healthz

curl --fail --silent --show-error \
  -H "Authorization: Bearer $API_KEY" \
  http://127.0.0.1:8787/api/v1/stickers

curl --fail --silent --show-error \
  -H "Authorization: Bearer $API_KEY" \
  http://127.0.0.1:8787/api/v1/fonts
```

### 生成图片

请求使用 `Content-Type: application/json`，正文最大 8 KiB，仅接受以下字段：

| 字段 | 必填 | 默认值 | 取值 |
| --- | --- | --- | --- |
| `stickerId` | 是 | — | 素材接口返回的底图 `id` |
| `text` | 是 | — | 非空文案，最多 200 个 Unicode 字符；支持 `\n` 换行 |
| `font` | 否 | `maoken` | 下表中的字体 ID |
| `color` | 否 | `#3565ae` | `#RRGGBB` 格式的文字颜色 |
| `background` | 否 | `transparent` | `transparent` 或 `white` |
| `layout` | 否 | `caption` | `caption` 留白配字，或 `overlay` 叠加文字 |

| 字体 ID | 字体名称 |
| --- | --- |
| `maoken` | 猫啃什锦黑 |
| `zcool-kuaile` | 站酷快乐体 |
| `zcool-qingke-huangyou` | 站酷庆科黄油体 |
| `ma-shan-zheng` | 马善政毛笔手写 |

其余排版沿用网页默认值：在 512 × 512 逻辑画布上，文字位置为 `(256, 72)`，字号为 `54`，白色描边宽度为 `9`，旋转为 `-5°`，行距为 `62`，字距为 `0`，关闭弧形文字；最终以 2 倍尺寸输出。接口拒绝未知字段。

```sh
curl --fail --silent --show-error \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  --data '{
    "stickerId": "studio-design-cheer",
    "text": "今天也要开心呀",
    "font": "maoken",
    "color": "#3565ae",
    "background": "transparent",
    "layout": "caption"
  }' \
  --output sticker.png \
  http://127.0.0.1:8787/api/v1/render
```

长文案按给定位置绘制，不自动缩小字号或换行，可通过 `\n` 手动分行。透明画布保留底图原有的白色像素；GIF 使用首帧，输出统一为静态 PNG。

### 错误响应

错误返回 JSON，结构为 `{ "error": { "code": "...", "message": "..." } }`。

| HTTP 状态 | 含义 |
| --- | --- |
| `400` | JSON 或参数无效，包括未知字段 |
| `401` | 缺少或使用了错误的 Bearer 密钥 |
| `404` | 接口或底图不存在 |
| `413` | 请求正文超过 8 KiB |
| `415` | 请求正文不是 `application/json` |
| `429` | 达到全服务每分钟渲染频率上限 |
| `503` | 达到同时渲染数量上限 |
| `500` | 图片加载或渲染失败 |

## Python / AstrBot 调用

使用 `httpx` 异步获取 PNG 字节，便于接入机器人的消息处理流程：

```python
import os

import httpx


async def render_sticker(
    text: str, base_url: str = "http://127.0.0.1:8787"
) -> bytes:
    """Render a sticker and return PNG bytes for a bot message."""
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            f"{base_url}/api/v1/render",
            headers={"Authorization": f"Bearer {os.environ['API_KEY']}"},
            json={"stickerId": "studio-design-cheer", "text": text},
        )
        response.raise_for_status()
        return response.content
```

后续 AstrBot 插件可将返回的 `bytes` 交给图片消息组件。示例地址适用于同一主机网络；容器中的 AstrBot 需要使用能访问到该服务的地址。

## 更新服务

素材、字体和清单随仓库快照打包。拉取最新仓库后，重新构建并启动容器：

```sh
git pull
docker compose --env-file .env.api up -d --build
```

直接运行 Node.js 时，拉取更新后执行 `npm ci`，再重启 `npm run api` 进程。现有 GitHub Actions 自动更新仓库素材并发布 GitHub Pages；运行中的 API 需要按上述方式更新。GitHub Pages 提供网页，HTTP 服务单独运行。

素材署名与授权范围见 [素材来源](../ASSET_SOURCES.md)，依赖许可见 [第三方来源与许可](../THIRD_PARTY_NOTICES.md)。
