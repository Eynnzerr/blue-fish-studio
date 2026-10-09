# 云服务器部署

本方案以 `https://eynnzerr.cloud/blue-fish` 作为公共入口的部署目标。Nginx 终止 HTTPS、按出口 IP 限流，并用服务器上的私密 Key 转发到本机 Docker 服务。完成公网验证后，AstrBot 插件可使用这个地址，API Key 留空。

本方案复用 `eynnzerr.cloud` 已有的 HTTPS 站点与证书，只增加 `/blue-fish/` 路由。保留现有的 `/bandori` 等路由和证书续期配置。

## 当前状态

2026-10-09：镜像和 Nginx 路由已安装，服务器内 HTTPS 健康检查通过。批量图片检查期间服务器出现严重资源等待，现已停止肥鱼 API 并禁用自动重启，SSH 和原有 AstrBot 已恢复。图片接口云端验收尚未完成。

域名尚未备案，公网访问被阿里云备案检查拦截。插件默认公共地址待服务器资源调整、备案及公网验证完成后发布。

当前服务器使用预构建镜像 `blue-fish-studio-api:cloud-27384b3`。部署目录 `/opt/blue-fish-studio` 保存 Compose、`.env.api`、`deploy/` 配置和 `checks/` 验证文件，是运行目录；源码与镜像构建在本机完成。

## 本机构建并传送镜像

服务器内存较紧张，因此先在本机仓库构建 Linux amd64 镜像。以下命令中的 `cloud-27384b3` 是本次版本标签，后续发布应使用新标签：

```sh
docker buildx build --platform linux/amd64 --load \
  -t blue-fish-studio-api:cloud-27384b3 .
mkdir -p .preview
docker save blue-fish-studio-api:cloud-27384b3 | gzip \
  > .preview/blue-fish-studio-api-cloud-27384b3.tar.gz
scp .preview/blue-fish-studio-api-cloud-27384b3.tar.gz \
  user@your-server:/opt/blue-fish-studio/
```

将 `user@your-server` 换成服务器的 SSH 登录目标。首次部署还需将仓库的 `deploy/` 目录传到同一运行目录。

## 启动服务器容器

在服务器的 `/opt/blue-fish-studio/.env.api` 中设置随机 `API_KEY`，可用 `openssl rand -hex 32` 生成，并将文件权限设为 `600`。后续更新保留这个文件。

服务器使用独立的 `compose.yaml`，直接引用已传入的镜像：

```yaml
name: blue-fish-studio

services:
  api:
    image: blue-fish-studio-api:cloud-27384b3
    init: true
    restart: "no"
    ports:
      - "127.0.0.1:8787:8787"
    environment:
      API_KEY: ${API_KEY:?Set API_KEY in .env.api}
      HOST: 0.0.0.0
      PORT: "8787"
      MAX_CONCURRENT_RENDERS: "1"
      RATE_LIMIT_PER_MINUTE: "60"
    mem_limit: 384m
    memswap_limit: 768m
    cpus: 1.0
```

```sh
cd /opt/blue-fish-studio
chmod 600 .env.api
docker load -i blue-fish-studio-api-cloud-27384b3.tar.gz
docker compose --env-file .env.api up -d --no-build
curl --fail http://127.0.0.1:8787/healthz
```

容器端口只映射到主机 `127.0.0.1:8787`，最多使用 1 个 CPU、384 MiB 内存，内存与 swap 合计上限为 768 MiB。每个进程同时合成 1 张图，目录预览与成品图片共用每分钟 60 次的额度。这是本次试部署的配置，当前保持停止；资源调整并通过图片验收后，再将重启策略改为 `unless-stopped`。

### 资源排障记录

本机总内存约 1.6 GiB，部署前可用内存约 238 MiB，原有 AstrBot/NapCat 容器占用约 945 MiB。在 API 容器内同时运行完整图片检查时，服务器的 SSH 握手与 HTTPS 请求开始超时。现场内存与 I/O 压力指标分别达到 `full avg10=80.64` 和 `86.54`，表示这段时间内大量任务因资源等待而停顿。系统配置 `vm.swappiness=0`，当时 2 GiB swap 未被使用。

检查程序还会解码返回的 PNG、创建校验画布并读取像素，与服务共用容器内存。停止检查进程及 API 后，新 SSH 连接成功，原有 AstrBot 面板返回 HTTP 200。容器未报告 OOM，内核日志中也未找到本次 OOM 记录；现有证据指向严重内存回收和 I/O 等待，具体峰值仍需单独测量。

后续应先增加可用内存，再从开发机通过 SSH 隧道发送逐张图片请求，在开发机检查 PNG。服务器只运行 API，分别记录单张成图与最多 8 张素材目录的耗时、容器内存和主机压力，完成后再进行连续请求验收。

## 接入现有 Nginx

将仓库的两个配置文件复制到 `/etc/nginx/snippets/`：

```sh
install -d /etc/nginx/snippets
install -m 644 deploy/nginx-blue-fish-http.conf /etc/nginx/snippets/
install -m 644 deploy/nginx-blue-fish-locations.conf /etc/nginx/snippets/
```

在现有 `nginx.conf` 的 `http` 块中、`server` 配置之前加入一次：

```nginx
include /etc/nginx/snippets/nginx-blue-fish-http.conf;
```

在 `eynnzerr.cloud` **已有的 HTTPS `server` 块**内加入：

```nginx
include /etc/nginx/snippets/nginx-blue-fish-locations.conf;
```

单独创建 `/etc/nginx/snippets/blue-fish-secret.conf`，权限设为 `600`。其内容只有一条指令，值与 `.env.api` 的 `API_KEY` 相同：

```nginx
proxy_set_header Authorization "Bearer REPLACE_WITH_SERVER_API_KEY";
```

```sh
chmod 600 /etc/nginx/snippets/blue-fish-secret.conf
nginx -t
systemctl reload nginx
```

私密 Key 只存于服务器的上述两个文件，不写入仓库或插件。Nginx 将 `/blue-fish/api/v1/render` 转发为本机的 `/api/v1/render`；插件配置中的服务 URL 保留 `/blue-fish` 前缀。

每个来源 IP 每分钟允许 20 次请求，另允许最多 5 次突发请求。一个 AstrBot 的多个群通常共享同一个出口 IP。触发此限制会返回 `429` JSON 和 `Retry-After`，调用方稍后重试即可。服务端的全局渲染限流返回 `429`，渲染并发已满返回 `503`。

API 访问日志位于 `/var/log/nginx/blue-fish-access.log`，记录来源 IP、路径、状态、响应字节数与耗时，不记录请求正文、查询参数或认证头。图片在内存中合成后直接返回。

## 验证入口

先在服务器内验证 HTTPS 反代，`--resolve` 保留域名和证书检查，并将连接指向本机 Nginx：

```sh
curl --fail --silent --show-error \
  --resolve eynnzerr.cloud:443:127.0.0.1 \
  https://eynnzerr.cloud/blue-fish/healthz
```

备案完成后，从服务器外验证公共入口：

```sh
curl --fail --silent --show-error \
  https://eynnzerr.cloud/blue-fish/healthz

curl --fail --silent --show-error \
  https://eynnzerr.cloud/blue-fish/api/v1/stickers

curl --fail --silent --show-error \
  -H 'Content-Type: application/json' \
  --data '{"stickerId":"studio-design-cheer","text":"肥鱼上线啦！"}' \
  --output sticker.png \
  https://eynnzerr.cloud/blue-fish/api/v1/render
```

在 AstrBot 中将服务 URL 设为 `https://eynnzerr.cloud/blue-fish`、API Key 留空，先发送 `/肥鱼素材` 查看编号目录，再发送 `/肥鱼 1 肥鱼上线啦！` 验证制图。完整参数见 [接口文档](api.md)。

## 更新服务

图片、字体和素材清单随镜像打包。在本机源码仓库拉取更新，按“本机构建并传送镜像”一节使用新标签重新构建并上传。随后在服务器加载新镜像，修改 `compose.yaml` 的 `image` 标签，再替换容器：

```sh
cd /opt/blue-fish-studio
docker load -i blue-fish-studio-api-NEW_VERSION.tar.gz
# Set image: blue-fish-studio-api:NEW_VERSION in compose.yaml.
docker compose --env-file .env.api up -d --no-build
curl --fail http://127.0.0.1:8787/healthz
```

保留服务器的 `.env.api` 和 Nginx 私密文件。当前服务器运行目录通过镜像更新；`git pull` 在本机源码仓库执行。GitHub Pages 发布只更新网页。

### 另一种方式：在服务器源码仓库构建

服务器资源充足时，也可另行克隆源码仓库，按照 [接口文档中的 Docker Compose 步骤](api.md#docker-compose) 创建 `.env.api`，使用仓库自带的 Compose 构建镜像。此方式在源码仓库中更新：

```sh
git pull --ff-only
docker compose --env-file .env.api up -d --build
```
