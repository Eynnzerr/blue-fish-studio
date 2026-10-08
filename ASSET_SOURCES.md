# 素材来源

大肥鱼工坊的素材分为「档案馆」与「工坊补充」两组。档案馆按 [EDMOK / blue-fish-archive](https://github.com/EDMOK/blue-fish-archive) 的清单收录静态图片与 GIF，保留原始文件与文件名。工坊补充收录 8 张透明底图：4 张原图去白底版本和 4 张参考角色形象的新构图。制作器输出静态 PNG，GIF 使用首帧。

## 角色与创作者

| 内容 | 来源 |
| --- | --- |
| 鲸鱼娘角色形象原作 | [上善无形 · Bilibili](https://space.bilibili.com/4456176) |
| DeepSeek 元素女仆鲸鱼娘二次设计 | [ZipZipPipe · Bilibili](https://space.bilibili.com/4168597) |
| 同人素材收集整理 | [EDMOK · GitHub](https://github.com/EDMOK) / [Bilibili](https://space.bilibili.com/291892724) |
| 图标 | 原仓库 `logo/favicon.png` |

原仓库 [README 的版权与来源说明](https://github.com/EDMOK/blue-fish-archive#版权与来源) 将 **ZipZipPipe 的二次设计作品**标注为 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans)：署名、非商业性使用、相同方式共享。立绘与表情包的相关权利归原作者及各自创作者所有；原仓库没有为其余所有素材提供统一许可或逐图授权信息。

原清单的 `selfMade: true` 表示该图由档案馆站长 EDMOK 制作。精选底图的名称与搜索标签由本项目为浏览和创作添加。

## 工坊补充

工坊补充使用独立清单 `public/studio/stickers.json`，所有记录均为 `origin: "studio"`，界面统一显示在「工坊补充」来源下。

「吃瓜」「鲸鱼窝」「气鼓鼓」「开心干饭」来自档案馆内对应的白底无字图片，经去白底处理后存放于 `public/studio/cutouts/`。每条记录通过 `sourceId` 关联 `public/stickers.json` 中的原图 `id`，图片权利与署名要求承接各自原图。处理记录与提示词见 [artwork/cutout-prompts.json](artwork/cutout-prompts.json)。

另外四张是参考鲸鱼娘角色形象设计的新构图，存放于 `public/studio/designs/`：

| 名称 | 画面 |
| --- | --- |
| 给你打气 | 手持双蓝白荧光棒 |
| 灵感来了 | 双手捧着灯泡 |
| 下班开溜 | 乘着鲸鱼四轮滑板 |
| 今天先躺平 | 躺在对角摆放的长鲸鱼睡袋中 |

新构图使用 `referenceIds` 记录两张角色参考图：`c0b02b5d709e92585afa2d6167f411e6.png` 与 `d9b03a02-385e-4fbc-80db-8fd48a03abdb.png`。其角色形象相关权利仍归原作者，设计记录与提示词见 [artwork/design-prompts.json](artwork/design-prompts.json)。

## 素材导入

[Sync archive assets](https://github.com/Eynnzerr/blue-fish-studio/actions/workflows/sync-archive.yml) 工作流每小时检查上游 `main`，也可在 Actions 页面手动运行。发现新提交后，固定到该提交导入原图、缩略图与清单，提交同步结果；有素材变化时自动调用 GitHub Pages 部署流程。上游只有文档等其他改动时，仅更新同步记录。

同步使用 GitHub 自动提供的 `GITHUB_TOKEN`，无需额外配置密钥。`.github/blue-fish-archive.sha` 记录最后处理的上游提交。定时检查可能因 GitHub 排队而延迟；公开仓库连续 60 天没有活动时，GitHub 会暂停定时工作流，可在 Actions 页面重新启用。详见 [GitHub 定时工作流说明](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)。

也可准备好上游仓库后，在项目目录手动导入：

```sh
node scripts/sync-assets.mjs
```

默认读取同级 `../blue-fish-archive`，也可以传入其他本地仓库路径：

```sh
node scripts/sync-assets.mjs /path/to/blue-fish-archive
```

脚本将 manifest 中的全部原图复制到 `public/archive/media/`，将缩略图复制到 `public/archive/previews/`，并生成 `public/stickers.json`。图片复制完整后替换档案馆目录，同时移除已不在上游清单中的文件。所有导入记录使用 `origin: "archive"`；同步只更新档案馆目录与清单，不会覆盖 `public/studio/` 中的工坊补充。网页分别读取两份清单，运行和部署使用项目内的素材副本。

清单保留原文件名作为 `id`；`width`、`height` 沿用原仓库的缩略图尺寸，可用于计算图像比例。Canvas 渲染和导出使用原图加载后的自然尺寸。
