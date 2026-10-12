# 云服务器部署

正式网页由 GitHub Pages 托管在 `https://fish.eynnzerr.cloud/`。云服务器通过已有 Nginx HTTPS 站点提供统计接口 `https://eynnzerr.cloud/blue-fish/api/v1/stats`，累计访问与网页成品导出次数。

## 当前状态

2026-10-11：独立统计服务与 GitHub Pages 接入已上线，正式网页打开后的访问计数、PNG 下载后的导出计数和页脚展示均已验收。公网 HTTPS、允许站点的 CORS 上报、事件去重及重启持久化已验证。数据从本次上线开始累计。统计进程使用现有镜像中的 Node.js 运行环境，稳定后约占 24 MiB 内存，上限 96 MiB。

2026-10-12：云主机普通重启后，统计接口和网页页脚恢复，原有计数保留，访问与 PNG 下载继续正常累计。SQLite 完整性检查通过。

同日下午，主机总内存已增至约 3.4 GiB。统计健康检查改用 Node 内置 HTTP 客户端，单次检查进程的实测峰值从约 56 MiB 降至 45 MiB；部署后 80 秒采样中容器内存峰值约 51 MiB，无内存上限触发。APT 下载与升级任务已降低 CPU 和磁盘优先级，自动安全更新继续启用。

图片 API 已于 2026-10-12 在升级至 4 GB 的主机上重新启用，与独立统计服务共同运行。公网生成 1024 × 1024 PNG、素材目录、字体、输入校验和限流均通过检查。完整记录见[图片服务验收](image-api-acceptance-20261012.md)。

图片入口面向所有安装肥鱼工坊 AstrBot 插件的 QQ Bot，默认无需 API Key。云端已启用公共调用，并为维护或已授权实例保留部分凭证额度；统计接口使用独立路由与限流额度。

当前服务器使用预构建镜像 `blue-fish-studio-api:cloud-27384b3`。部署目录 `/opt/blue-fish-studio` 保存 Compose、`.env.api`、`deploy/` 配置和 `checks/` 验证文件，是运行目录；源码与镜像构建在本机完成。

## 独立统计服务

将以下文件同步到 `/opt/blue-fish-studio/`，保持目录结构：

- `compose.stats.yaml`
- `server/stats-server.ts`、`server/stats-service.ts`、`server/http.ts`、`server/stats.ts`
- `deploy/nginx-blue-fish-http.conf`、`deploy/nginx-blue-fish-stats.conf`

服务器的 `.env.stats` 内容为：

```dotenv
STATS_RUNTIME_IMAGE=blue-fish-studio-api:cloud-27384b3
STATS_ALLOWED_ORIGINS=https://fish.eynnzerr.cloud,https://eynnzerr.github.io
STATS_RATE_LIMIT_PER_MINUTE=3000
```

首次启动时创建持久化目录，并赋予容器用户写入权限：

```sh
cd /opt/blue-fish-studio
install -d -m 750 -o 1000 -g 1000 data
docker compose -f compose.stats.yaml --env-file .env.stats up -d --no-build --pull never
curl --fail http://127.0.0.1:8791/healthz
```

统计容器为 `blue-fish-studio-stats-stats-1`，仅绑定主机 `127.0.0.1:8791`。数据库保存在宿主机 `data/stats.sqlite`，源码更新后重启统计容器即可生效：

```sh
docker compose -f compose.stats.yaml --env-file .env.stats restart stats
```

Nginx 的 `http` 块使用 `nginx-blue-fish-http.conf`，已有 HTTPS `server` 块中增加：

```nginx
include /etc/nginx/snippets/nginx-blue-fish-stats.conf;
```

安装两个配置文件后执行 `nginx -t` 和 `systemctl reload nginx`。统计路由按访客 IP 限制为每分钟 60 次，最多额外接受 10 次突发请求。请求转发到独立统计端口；已有图片 API 路由继续使用 8787。

GitHub 仓库 Actions Variable `VITE_STATS_API_URL` 设置为 `https://eynnzerr.cloud/blue-fish/api/v1/stats`，Pages 工作流在构建时读取。正式网页每次打开上报访问，完成图片下载或复制后上报导出；详细口径见 [全站统计](statistics.md)。

验证公网读取：

```sh
curl --fail https://eynnzerr.cloud/blue-fish/api/v1/stats
```

## 主机后台维护优先级

`deploy/systemd/apt-background-priority.conf` 为 APT 后台任务设置 `Nice=19` 和 `IOSchedulingClass=idle`，使其在 CPU、磁盘争用时优先让线上服务运行。当前主机使用 Linux 6.8 的 `mq-deadline` 调度器，支持该 I/O 优先级类别；该配置在下一次定时启动时生效。

将配置文件同步到服务器后安装为两个服务的 drop-in：

```sh
for unit in apt-daily.service apt-daily-upgrade.service; do
  install -d -m 755 "/etc/systemd/system/$unit.d"
  install -m 644 deploy/systemd/apt-background-priority.conf \
    "/etc/systemd/system/$unit.d/10-background-priority.conf"
done
systemctl daemon-reload
systemctl show apt-daily.service apt-daily-upgrade.service \
  -p Nice -p IOSchedulingClass
```

预期显示 `Nice=19`、`IOSchedulingClass=3`。两个原有 timer 继续启用，`APT::Periodic::Update-Package-Lists` 与 `Unattended-Upgrade` 均保持为 `1`。回滚时只删除这两个 `10-background-priority.conf` 文件，再执行 `systemctl daemon-reload`。

本次统计 Compose 配置与 SQLite 在线备份保存在服务器 `/opt/blue-fish-studio/backups/resource-tuning-20261012-173839/`。

后续各节为图片 API 的部署与资源排障记录。

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

云端 Compose 设置 `ALLOW_ANONYMOUS_RENDER=true` 和 `PUBLIC_RATE_LIMIT_PER_MINUTE=24`，允许插件以空 API Key 使用公共服务。原生运行和普通自建部署的 `ALLOW_ANONYMOUS_RENDER` 默认为 `false`，需要凭证调用；自建服务可按需启用公共模式。

仓库的 `deploy/compose.cloud.yaml` 保存云端配置。将它同步为服务器的 `/opt/blue-fish-studio/compose.yaml`，同时同步 `server/` 目录。服务代码以只读目录挂载，素材、字体和共享绘图库继续来自已传入的镜像：

```sh
cd /opt/blue-fish-studio
chmod 600 .env.api
install -d -m 750 -o 1000 -g 1000 data
docker load -i blue-fish-studio-api-cloud-27384b3.tar.gz
docker compose --env-file .env.api up -d --no-build --pull never
curl --fail http://127.0.0.1:8787/healthz
```

容器端口只映射到主机 `127.0.0.1:8787`，最多使用 1 个 CPU、512 MiB 内存、128 个进程或线程；内存与 swap 合计上限为 640 MiB。目录预览与成品图片共用每分钟 30 次的总渲染额度，公共调用最多使用其中 24 次，为有效凭证调用保留 6 次。凭证调用也可使用尚未消耗的其余额度，所有调用共享 1 个渲染并发。

每次渲染在独立子进程中执行，输出 PNG 后退出，使操作系统回收原生内存；超过 20 秒的子进程会被终止，PNG 输出上限为 8 MiB。Node.js 直接运行 TypeScript，主进程和渲染子进程的 JavaScript 老生代堆上限均为 96 MiB。轻量 HTTP 健康检查每分钟运行一次。容器使用 `unless-stopped` 重启策略，日志最多保留两个 5 MiB 文件。

图片 API 与统计进程共用宿主机 `data/stats.sqlite`，通过 SQLite WAL 协调访问；网页统计请求继续由独立统计进程响应。仅更新服务代码时，同步 `server/` 后执行 `docker compose --env-file .env.api restart api`。

### 资源排障记录

2026-10-12 的故障中，SSH、HTTP 和 HTTPS 均失去响应，阿里云诊断报告显示云盘 I/O 受限。历史监控显示，03:03 APT 自动更新启动后，匿名内存增加约 100 MiB，文件缓存缩减，磁盘读取从约 4 MiB/s 升至约 140 MiB/s，CPU I/O 等待约 80%，持续至少至 11:52。APT 是现有证据最强的触发点，故障前未保存逐进程 I/O。普通重启于 12:42 完成后，磁盘使用率为 45%，统计数据库与 AstrBot 面板恢复。详见[内存与磁盘压力调查](resource-incident-20261012.md)。

服务器已有 2 GiB swap，现将 `/etc/sysctl.conf` 中的 `vm.swappiness` 从 `0` 调整为当前 `virtual-guest` 配置中的 `30`，并立即生效，以允许更早交换不活跃内存页。原配置与 SQLite 在线备份保存在 `/opt/blue-fish-studio/backups/recovery-20261012-1247/`。调整后 swap 开始使用，内存和 I/O 的 PSI `avg10` 均恢复为 `0.00`。

2026-10-09 图片 API 排障时，主机总内存约 1.6 GiB，部署前可用内存约 238 MiB，原有 AstrBot/NapCat 容器占用约 945 MiB。在 API 容器内同时运行完整图片检查时，服务器的 SSH 握手与 HTTPS 请求开始超时。现场内存与 I/O 压力指标分别达到 `full avg10=80.64` 和 `86.54`，表示这段时间内大量任务因资源等待而停顿。系统配置 `vm.swappiness=0`，当时 2 GiB swap 未被使用。

检查程序还会解码返回的 PNG、创建校验画布并读取像素，与服务共用容器内存。停止检查进程及 API 后，新 SSH 连接成功，原有 AstrBot 面板返回 HTTP 200。容器未报告 OOM，内核日志中也未找到本次 OOM 记录；现有证据指向严重内存回收和 I/O 等待，具体峰值仍需单独测量。

2026-10-12 升级内存后的复测通过 SSH 隧道从开发机逐张发送请求，并在开发机解码检查 PNG。服务器只运行 API；单张图片、最多 8 张素材目录和连续请求的验收结果见[图片服务验收](image-api-acceptance-20261012.md)。

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

在安装 `http` 配置前，单独创建 `/etc/nginx/snippets/blue-fish-secret.conf`，权限设为 `600`。该文件由 `http` 级 `map` 引入，内容为一条大小写敏感、首尾锚定的匹配规则，将占位符替换为 `.env.api` 中的 64 位十六进制 `API_KEY`：

```nginx
"~^Bearer REPLACE_WITH_SERVER_API_KEY$" 1;
```

```sh
chmod 600 /etc/nginx/snippets/blue-fish-secret.conf
nginx -t
systemctl reload nginx
```

Nginx 的 `map` 允许空 Authorization；非空但无效的凭证在读取正文、计算连接数和速率限制前返回 `401`。有效凭证原样转发给后端再次校验，后端根据调用者提供的 Authorization 区分公共和凭证额度。Nginx 不注入服务端密钥或身份标记。

密钥保存在服务器的上述两个私密文件及已获授权机器人的私密配置中。默认插件配置不含共享密钥，公众用户保持 API Key 留空。轮换时同步更新 `.env.api`、Nginx 匹配规则和已授权机器人配置，重建 API 容器以应用环境变量，再校验并重载 Nginx。Nginx 将 `/blue-fish/api/v1/render` 转发为本机的 `/api/v1/render`；插件配置中的服务 URL 保留 `/blue-fish` 前缀。

本次公共服务配置已部署，更改前的备份位于 `/opt/blue-fish-studio/backups/public-bot-api-20261012-210020/`。

每个来源 IP 每分钟允许 20 次请求，另允许最多 3 次突发请求。图片入口最多同时接收 4 个请求，每个 IP 最多 2 个；统计路由继续使用独立配置。一个 AstrBot 的多个群通常共享出口 IP 额度。频率限制返回 `429` JSON 和 `Retry-After`，连接数限制或渲染并发已满返回 `503`。请求正文读取间隔上限为 10 秒，连接上游超时为 3 秒，向上游发送请求的超时为 10 秒，读取上游响应的超时为 30 秒。

API 访问日志位于 `/var/log/nginx/blue-fish-access.log`，记录来源 IP、路径、状态、响应字节数与耗时，不记录请求正文、查询参数或认证头。图片在内存中合成后直接返回。

## 验证入口

先在服务器内验证 HTTPS 反代，`--resolve` 保留域名和证书检查，并将连接指向本机 Nginx：

```sh
curl --fail --silent --show-error \
  --resolve eynnzerr.cloud:443:127.0.0.1 \
  https://eynnzerr.cloud/blue-fish/healthz
```

图片服务恢复后，从服务器外验证公共入口：

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

在 AstrBot 中将服务 URL 设为 `https://eynnzerr.cloud/blue-fish`、API Key 留空，先发送 `/肥鱼素材` 查看编号目录，再发送 `/肥鱼 1 肥鱼上线啦！` 验证普通安装后的制图流程。完整参数见 [接口文档](api.md)。

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
