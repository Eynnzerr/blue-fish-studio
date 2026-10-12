# 素材自动标注

档案馆原图通过并行科技 Qwen3.8-Flash 提取名称、情绪、使用场景、动作和图片内文字。结果进入静态素材清单，网页按名称、标签和原有文字搜索。工坊补充素材沿用已有人工名称和标签。

## 配置模型服务

在并行科技账户中取得可调用 `Qwen3.8-Flash` 的 API Key，然后在本仓库 **Settings → Secrets and variables → Actions** 配置：

| 类型 | 名称 | 值 |
| --- | --- | --- |
| Secret | `LABEL_API_KEY` | 并行科技 API Key |
| Variable，可选 | `LABEL_API_BASE_URL` | 默认 `https://llmapi.paratera.com/v1` |
| Variable，可选 | `LABEL_MODEL` | 默认 `Qwen3.8-Flash`，区分大小写 |
| Variable，可选 | `LABEL_MAX_ITEMS` | 定时运行每批上限，默认 `50`，范围 `1–500` |
| Variable，可选 | `LABEL_AUTO_ENABLED` | 样本验收后设为 `true`，开启定时模型调用；默认关闭 |

API Key 与 Base URL 对应同一服务。脚本将 `/chat/completions` 追加到 Base URL，使用图片输入、`enable_thinking: false` 和 JSON Object 输出。并行科技的 `Qwen3.8-Flash` 已验证支持这些参数；切换其他模型时需确认图片输入和参数兼容性。Key 仅注入标注步骤，网页和生成的素材清单只接收标注内容。

平台入口：[并行智算云](https://ai.paratera.com/)。当前账户的模型 ID 可通过带 Bearer 鉴权的 `GET https://llmapi.paratera.com/v1/models` 获取。

## 本地运行

使用 Node.js 20.19+ 或 22.12+，安装项目依赖后，将 `.env.labels.example` 复制为 `.env.labels.local` 并填写 Key。该文件由 Git 忽略。

```sh
# 只读查看待处理数量与前 25 张素材 ID，不调用模型，也不改文件。
npm run label:assets -- --dry-run --limit 25

# 不调用模型，刷新待处理计数并合并已有有效标签。
npm run label:assets -- --scan-only

# 对最多 25 张待处理原图调用模型，并保存结果。
npm run label:assets -- --limit 25
```

脚本从当前 `public/stickers.json` 找到档案馆原图。首次执行处理尚无自动结果的图片，后续按原图 SHA-256 复用结果；相同字节的副本也复用。使用原图生成最长边不超过 1024 px 的识别图，透明像素合成白底，动画使用静态帧。请求逐张执行，每个完成的结果单独保存。

每张输出包含 `name`、`emotions`、`scenes`、`actions`、`ocrText` 和 `needsReview`。标签必须属于脚本中的固定词表，每组最多三项；JSON 或标签不符合约定时要求模型纠正，单张总计最多尝试三次，仍不合格则进入失败队列。模型使用的 `model` 和 `promptVersion` 随结果保存，调整提示词不会自动重跑全部素材。

## GitHub Actions 自动化

`Sync archive assets` 每小时第 17 分钟检查上游 SHA 和小型队列文件。有新素材、启用自动标注后有可处理的待标注图片，或手动运行时，才检出项目。

1. 上游变化或手动运行时同步原图与预览。
2. 扫描当前原图，合并有效标签并刷新待处理数量。没有 Key 时也执行该步骤。
3. 有 Key、允许本次模型调用且仍有待处理项时安装依赖，按本批上限调用模型。
4. 提交素材、标签和上游同步检查点。公开图片或 `public/stickers.json` 变化时，显式调用 Pages 工作流部署。

手动运行时，`label_images` 控制是否调用模型，`label_limit` 控制本批上限，默认 `25`。首次接入先手动运行 25 张，检查名称、场景和 OCR；验收后将 `LABEL_AUTO_ENABLED` 设为 `true`。定时运行使用 `LABEL_MAX_ITEMS`。

`metadata/label-status.json` 记录：

- `pending`：当前原图尚无匹配指纹的自动结果，含此前失败项。
- `review`：模型标记为需要人工复核的当前候选。
- `failed`：待处理图片中曾调用失败的数量。

标签状态与上游 SHA 独立判断，因此启用自动标注后，识别失败、每批数量限制留下的图片，会在后续定时运行继续处理。未尝试的图片优先，失败项按上次请求时间轮转。模型标记为待复核的成功结果不重复调用，也暂不进入公开搜索。

网络超时、限流和服务端错误会短暂重试；鉴权、模型配置或持续网络错误会结束本批模型调用。已完成的标注保留，标注步骤以失败状态和警告显示，后续素材同步仍可提交，运行摘要显示成功、失败、Token 用量和剩余数量。

## 人工修正

`metadata/sticker-labels.json` 是标注来源，按档案馆原始文件名保存。每条记录的 `automatic` 是模型结果，`manual` 是人工覆盖；两者分别关联原图指纹。现有十张精选图的名称和标签保存在 `manual` 中。

人工修正示例，`sha256` 复制同条当前 `automatic.sha256`：

```json
{
  "manual": {
    "sha256": "当前原图的SHA-256",
    "name": "开心干饭",
    "tags": ["开心", "吃饭", "端碗"],
    "ocrText": "开饭了"
  }
}
```

保留同条 `automatic`，只补写或修改 `manual`。字段级合并时人工值优先；空标签数组或空 `ocrText` 表示明确清空对应内容。复核待审候选时填写完整的名称、标签和 OCR。

发现模型漏报的歧义或小字误识别时，可将对应 `automatic.needsReview` 改为 `true`，暂时撤下自动名称、标签和 OCR，人工覆盖仍保留。补齐同指纹的完整 `manual` 后，该项不再计入待复核数量。

完成后运行 `npm run label:assets -- --scan-only` 更新公开清单和队列计数，再提交标注文件及生成清单。自动同步也会重新合并这些记录。

同名图片内容变化后，旧指纹的标签停止应用，旧人工记录保留供核对；删除上游素材也会保留其标注记录。重新识别指定图片时，删除它的 `automatic` 和 `error`，保留 `manual`，再扫描并运行标注命令。
