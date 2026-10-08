# 大肥鱼表情工坊 · Blue Fish Studio

以 DeepSeek 鲸鱼娘为主角的表情包制作器。使用 React、Vite 和 TypeScript 构建独立静态网页，参考 [Moesekai 表情包制作器](https://pjsk.moe/zh-cn/sticker-maker/) 的创作功能与 Material 3 风格；图片和文字在浏览器内合成。

**在线使用：[大肥鱼表情工坊](https://eynnzerr.github.io/blue-fish-studio/)**

## 功能

- **选底图**：249 张档案馆素材与 8 张工坊补充，按来源分别浏览；支持名称、文件名和标签搜索，自作分类、本机收藏及本地图片导入。
- **生成底图**：填写 OpenAI 兼容服务的 Base URL、模型名称、API Key 和提示词，预览后放入「我的素材」继续配字，也可直接下载底图。
- **写文案**：多行文字、推荐文案、随机灵感；内置猫啃什锦黑、站酷快乐体、站酷庆科黄油体、马善政毛笔手写与系统字体，可导入 TTF、OTF、WOFF、WOFF2。
- **调排版**：画布点击或拖动定位，调整字号、颜色、描边、旋转、行距、字距和弧形文字；一键恢复初始设置。
- **看效果**：留白配字与叠加文字两种布局，透明或白色画布，实时预览，浅色与深色主题。
- **导出**：复制图片或下载 512 × 512、1024 × 1024、1536 × 1536 PNG。

## 本地使用

环境要求：Node.js 20.19+ 或 22.12+，npm。

```sh
npm install
npm run dev
```

打开终端显示的本地地址，依次选择底图、输入文字、调整样式，然后复制或下载。「我的素材」收纳本次页面中上传、生成的图片，刷新页面后清除，请下载需要保留的作品。导入字体同样仅用于当前页面，收藏保存在浏览器本地存储中。

桌面端三张卡片以中间预览卡片等高对齐；右侧展开精细排版时在卡片内滚动，手机端自然纵向排列。内置字体在首次选中时加载，加载完成后即可预览与导出。

复制图片需要支持 Clipboard API 的浏览器，并在 `localhost` 或 HTTPS 环境中使用。GIF 以首帧合成，输出格式为 PNG。选择透明画布时，底图自身已有的白色像素仍会保留；工坊补充提供 8 张透明底素材，包括 4 张原图去白底版本与 4 张新构图。

## 使用自己的图像生成服务

点击素材栏的「生成底图」，填写服务商提供的 Base URL、图像模型名称、API Key 和 Prompt。Base URL 应包含服务商要求的路径前缀，例如 `https://api.openai.com/v1`，网页会追加 `/images/generations`；也可直接填写完整的生成接口地址。填写模型服务实际提供的模型名称。

请求按 [OpenAI Images API](https://developers.openai.com/api/reference/resources/images/methods/generate) 的格式发送，每次生成一张图，支持 `data[0].b64_json` 和 `data[0].url` 两种返回方式。默认省略尺寸与背景参数；可按所选模型的能力指定尺寸或透明输出。透明输出会发送 `background: "transparent"` 和 `output_format: "png"`。兼容服务需支持同步的 Images API；Chat Completions、Responses 和异步任务接口属于其他协议。

API Key 仅保存在当前页面内存中，刷新即清除。生成请求由浏览器直接发往填写的服务地址，服务需允许当前网站来源的 CORS 请求；远程图片地址也需允许跨域下载，图片下载不会携带 API Key。公网接口使用 HTTPS，本机接口支持 HTTP。提示词与 Key 会发送到该服务，服务商按其规则计费；停止等待或关闭弹窗会中断浏览器请求，服务端可能已经开始生成。

预览满意后点击「使用这张底图」，便可在「我的素材」中反复选择、配字和导出。生成的图片按个人素材处理，与档案馆及工坊补充独立。

## 素材同步

项目已包含素材副本，可直接运行。更新素材时，从相邻的 `blue-fish-archive` 仓库重新导入：

```sh
npm run sync:assets
```

也可指定仓库目录：

```sh
npm run sync:assets -- /path/to/blue-fish-archive
```

脚本更新 `public/archive/` 中的原图与缩略图，并生成 `public/stickers.json`，每条记录标记 `origin: "archive"`。工坊补充独立存放于 `public/studio/`，使用 `public/studio/stickers.json` 清单和 `origin: "studio"`，素材同步不会覆盖它们。

工坊补充包含两类素材：

- **原图去白底**：「吃瓜」「鲸鱼窝」「气鼓鼓」「开心干饭」，存放于 `public/studio/cutouts/`；`sourceId` 对应档案馆原文件名，图片权利承接原图。
- **新构图**：「给你打气」「灵感来了」「下班开溜」「今天先躺平」，存放于 `public/studio/designs/`；`referenceIds` 记录所用角色参考图，角色形象相关权利仍归原作者。

两类素材在界面中统一归入「工坊补充」。作者署名与授权范围见 [ASSET_SOURCES.md](ASSET_SOURCES.md)，处理与设计记录分别见 [cutout-prompts.json](artwork/cutout-prompts.json) 和 [design-prompts.json](artwork/design-prompts.json)。运行网页使用 `public/` 中的本地副本。

## 构建与部署

```sh
npm run build
npm run preview
```

将构建产物 `dist/` 完整部署到静态文件托管服务即可。项目采用相对资源路径，可放在网站根目录或 `/blue-fish-studio/` 等子目录；子目录入口保留末尾 `/`。生产环境使用 HTTPS，以支持复制图片。

本仓库通过 [GitHub Actions](https://github.com/Eynnzerr/blue-fish-studio/actions/workflows/pages.yml) 自动发布到 GitHub Pages：推送到 `main` 后，工作流安装依赖、构建并部署 `dist/`。也可在 Actions 中手动运行「Deploy GitHub Pages」。Fork 后，在仓库的 **Settings → Pages → Source** 中选择 **GitHub Actions**，再运行工作流。

在线生成底图时，模型服务需要允许网站来源 `https://eynnzerr.github.io` 的跨域请求。

## 目录

```text
src/App.tsx              页面、导入、字体和导出交互
src/components/          素材选择、编辑控件、画布预览
src/lib/canvas.ts        预览与 PNG 导出共用的绘图逻辑
src/lib/defaults.ts      默认设置、字体及灵感文案
src/lib/image-generation.ts  OpenAI 兼容图片请求与结果下载
src/types.ts             素材与编辑设置类型
public/archive/          249 张档案馆原图及缩略图
public/studio/stickers.json  工坊补充独立清单
public/studio/cutouts/   4 张原图去白底版本
public/studio/designs/   4 张参考角色形象的新构图
public/fonts/            内置字体及 OFL 许可
public/stickers.json     档案馆素材清单
artwork/cutout-prompts.json  去白底处理记录
artwork/design-prompts.json  新构图设计记录
scripts/sync-assets.mjs  本地素材导入脚本
```

功能参考与字体、依赖许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。本项目自有源码的许可证尚未指定。
