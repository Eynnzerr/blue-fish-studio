# 第三方来源与许可

## 功能与设计参考

[Moesekai](https://github.com/StarMoe-org/Moesekai) 的[表情包制作器](https://pjsk.moe/zh-cn/sticker-maker/)提供了功能与 Material 3 风格参考。本项目的界面和 Canvas 编辑器为独立实现。

Moesekai 源仓库采用 [GNU AGPL-3.0](https://github.com/StarMoe-org/Moesekai/blob/main/LICENSE)。

## 图片素材

内置图片和图标来自 [EDMOK / blue-fish-archive](https://github.com/EDMOK/blue-fish-archive)。角色、二次设计与素材整理的署名，以及 CC BY-NC-SA 4.0 对应的二次设计授权范围，详见 [ASSET_SOURCES.md](ASSET_SOURCES.md)。

## 内置字体

- 字体：[猫啃什锦黑 · MaokenAssortedSans](https://github.com/maoken-fonts/MaokenAssortedSans)。
- 文件：`public/fonts/MaokenAssortedSans-Lite.ttf`。
- 许可：SIL Open Font License 1.1，完整许可与版权声明见 [public/fonts/OFL.txt](public/fonts/OFL.txt)。
- 版权声明：Copyright (c) 2022-11-02, ZERO子；Copyright (c) 2022-11-01, Umihotaru。保留字体名称为 “Assorted”“什锦”。

另外三款字体使用 [Google Fonts](https://fonts.google.com/) 官方发布的完整 TTF 文件，保留原字形与字体元数据，分别随附原版 SIL Open Font License 1.1：

| 字体与官方上游 | 风格 | 本地字体文件 | 完整许可与版权声明 |
| --- | --- | --- | --- |
| [站酷快乐体 · ZCOOL KuaiLe](https://github.com/googlefonts/zcool-kuaile) | 活泼、轻快的装饰字形 | [ZCOOLKuaiLe-Regular.ttf](public/fonts/ZCOOLKuaiLe-Regular.ttf) | [OFL.txt](public/fonts/licenses/zcool-kuaile/OFL.txt) |
| [站酷庆科黄油体 · ZCOOL QingKe HuangYou](https://github.com/googlefonts/zcool-qingke-huangyou) | 圆角、紧凑的几何字形 | [ZCOOLQingKeHuangYou-Regular.ttf](public/fonts/ZCOOLQingKeHuangYou-Regular.ttf) | [OFL.txt](public/fonts/licenses/zcool-qingke-huangyou/OFL.txt) |
| [马善政毛笔手写 · Ma Shan Zheng](https://github.com/googlefonts/mashanzheng) | 粗笔、有力度的毛笔手写 | [MaShanZheng-Regular.ttf](public/fonts/MaShanZheng-Regular.ttf) | [OFL.txt](public/fonts/licenses/ma-shan-zheng/OFL.txt) |

快乐体发行文件来自 [Google Fonts 官方仓库](https://github.com/google/fonts/blob/main/ofl/zcoolkuaile/ZCOOLKuaiLe-Regular.ttf)；黄油体与马善政发行文件分别来自 Google Fonts 官方 CDN 的 [ZCOOL QingKe HuangYou v16](https://fonts.gstatic.com/s/zcoolqingkehuangyou/v16/2Eb5L_R5IXJEWhD3AOhSvFC554MOOahI4mRIiw.ttf) 和 [Ma Shan Zheng v18](https://fonts.gstatic.com/s/mashanzheng/v18/NaPecZTRCLxvwo41b4gvzkXaRMQ.ttf)。许可文件分别来自官方仓库的 [zcoolkuaile](https://github.com/google/fonts/tree/main/ofl/zcoolkuaile)、[zcoolqingkehuangyou](https://github.com/google/fonts/tree/main/ofl/zcoolqingkehuangyou)、[mashanzheng](https://github.com/google/fonts/tree/main/ofl/mashanzheng) 目录。版权分别归 The ZCOOL KuaiLe Project Authors、The ZCOOL QingKe HuangYou Project Authors、The Ma Shan Zheng Project Authors（均为 2018）所有。

## 运行时依赖

| 组件 | 来源 | 许可 |
| --- | --- | --- |
| React、React DOM | [facebook/react](https://github.com/facebook/react) | MIT |
| Lucide React 图标 | [lucide-icons/lucide](https://github.com/lucide-icons/lucide) | ISC；部分图标源自 MIT 授权的 Feather |
| API 图片渲染 `@napi-rs/canvas` | [Brooooooklyn/canvas](https://github.com/Brooooooklyn/canvas) | [MIT](https://github.com/Brooooooklyn/canvas/blob/main/LICENSE)；Copyright (c) 2020 lynweklm@gmail.com |
| API TypeScript 执行器 `tsx` | [privatenumber/tsx](https://github.com/privatenumber/tsx) | [MIT](https://github.com/privatenumber/tsx/blob/master/LICENSE)；Copyright (c) Hiroki Osame |

### React 与 React DOM

```text
MIT License

Copyright (c) Meta Platforms, Inc. and affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Lucide React

```text
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

本项目自有源码的许可证尚未指定。上述许可分别对应所列第三方项目与文件。
