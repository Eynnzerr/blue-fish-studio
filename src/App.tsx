import {
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Fish,
  Heart,
  ImagePlus,
  Info,
  Moon,
  MousePointer2,
  Sparkles,
  Sun,
  Type,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Gallery from "./components/Gallery";
import Editor from "./components/Editor";
import GenerationDialog from "./components/GenerationDialog";
import { StickerCanvas } from "./components/StickerCanvas";
import { BUILTIN_FONTS, DEFAULT_SETTINGS } from "./lib/defaults";
import { canvasToBlob, renderSticker } from "./lib/canvas";
import type { EditorSettings, FontOption, Sticker } from "./types";

/** Resolve a bundled URL for root and subdirectory deployments alike. */
function assetUrl(path: string) {
  return `${import.meta.env.BASE_URL}${path}`;
}

/** Jump between workshop sections on a narrow screen. */
function jumpToPanel(panel: "preview" | "gallery" | "editor") {
  document.querySelector(`.${panel}-panel`)?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
    block: "start",
  });
}

/** Complete local-first sticker workshop. */
export default function App() {
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [personalStickers, setPersonalStickers] = useState<Sticker[]>([]);
  const [generationOpen, setGenerationOpen] = useState(false);
  const [selected, setSelected] = useState<Sticker | null>(null);
  const [settings, setSettings] = useState<EditorSettings>({
    ...DEFAULT_SETTINGS,
  });
  const [fonts, setFonts] = useState<FontOption[]>(BUILTIN_FONTS);
  const [fontReady, setFontReady] = useState(false);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [exportScale, setExportScale] = useState(2);
  const [exporting, setExporting] = useState(false);
  const [dark, setDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const aboutRef = useRef<HTMLDialogElement>(null);
  const personalUrls = useRef<string[]>([]);
  const mounted = useRef(true);
  const imageSelection = useRef(0);
  const fontSelection = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all(
      ["stickers.json", "studio/stickers.json"].map(async (path) => {
        const response = await fetch(assetUrl(path), {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("素材清单加载失败，请刷新重试");
        return response.json() as Promise<Sticker[]>;
      }),
    )
      .then((collections) => {
        const localItems = collections.flat().map((item) => ({
          ...item,
          src: assetUrl(item.src),
          preview: assetUrl(item.preview),
        }));
        setStickers(localItems);
        setSelected((previous) => previous ?? localItems[0]);
      })
      .catch((cause: Error) => {
        if (cause.name !== "AbortError") setToast(cause.message);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let active = true;
    const face = new FontFace(
      "Maoken",
      `url("${assetUrl("fonts/MaokenAssortedSans-Lite.ttf")}")`,
    );
    face
      .load()
      .then((loaded) => {
        document.fonts.add(loaded);
        if (active) setFontReady(true);
      })
      .catch(() => {
        if (active) {
          setSettings((previous) =>
            previous.fontFamily === "Maoken"
              ? { ...previous, fontFamily: BUILTIN_FONTS[1].family }
              : previous,
          );
          setFonts((previous) =>
            previous.filter((font) => font.family !== "Maoken"),
          );
          setFontReady(true);
          setToast("内置字体加载失败，可使用系统字体或导入字体");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    setImage(null);
    setImageLoading(true);
    setError("");
    const nextImage = new Image();
    nextImage.onload = () => {
      if (active) {
        setImage(nextImage);
        setImageLoading(false);
      }
    };
    nextImage.onerror = () => {
      if (active) {
        setError("这张底图加载失败，请重新选择或上传图片");
        setImageLoading(false);
      }
    };
    nextImage.src = selected.src;
    return () => {
      active = false;
    };
  }, [selected]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      imageSelection.current += 1;
      personalUrls.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  /** Update only the controls changed by the user. */
  function updateSettings(patch: Partial<EditorSettings>) {
    if (patch.fontFamily) fontSelection.current += 1;
    setSettings((previous) => ({ ...previous, ...patch }));
  }

  /** Keep a gallery choice newer than any image still being decoded. */
  function selectSticker(sticker: Sticker) {
    imageSelection.current += 1;
    setSelected(sticker);
  }

  /** Restore the initial typography without changing the selected artwork. */
  function resetSettings() {
    fontSelection.current += 1;
    setSettings({ ...DEFAULT_SETTINGS, fontFamily: fonts[0].family });
    setToast("已恢复初始排版");
  }

  /** Decode a personal image and retain its Blob URL for this browser session. */
  async function addPersonalImage(
    blob: Blob,
    name: string,
    origin: "upload" | "generated",
    sourceNote: string,
  ) {
    const revision = ++imageSelection.current;
    const url = URL.createObjectURL(blob);
    const uploaded = new Image();
    uploaded.src = url;
    try {
      await uploaded.decode();
      if (!mounted.current) {
        URL.revokeObjectURL(url);
        return;
      }
      const sticker: Sticker = {
        origin,
        id: crypto.randomUUID(),
        name,
        sourceNote,
        src: url,
        preview: url,
        featured: false,
        tags: [],
        selfMade: false,
        animated: blob.type === "image/gif",
        width: uploaded.naturalWidth,
        height: uploaded.naturalHeight,
      };
      personalUrls.current.push(url);
      setPersonalStickers((previous) => [sticker, ...previous]);
      // Retain the import even if the user has since selected another background.
      if (revision === imageSelection.current) setSelected(sticker);
      setToast("已加入我的素材，可以继续配字了");
    } catch {
      URL.revokeObjectURL(url);
      throw new Error("图片无法读取，请选择 PNG、JPG、WebP 或 GIF");
    }
  }

  /** Import a local file into the same personal collection as generated artwork. */
  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      await addPersonalImage(file, file.name, "upload", "本地上传");
    } catch (cause) {
      setToast((cause as Error).message);
    }
  }

  /** Adopt a generated Blob as a reusable personal background in the editor. */
  async function useGeneratedImage(blob: Blob, name: string, model: string) {
    await addPersonalImage(blob, name, "generated", `使用 ${model} 创作`);
  }

  /** Install an uploaded font in the browser without transmitting its bytes. */
  async function uploadFont(file: File) {
    const revision = ++fontSelection.current;
    try {
      const family = `custom-${crypto.randomUUID()}`;
      const face = await new FontFace(family, await file.arrayBuffer()).load();
      document.fonts.add(face);
      setFonts((previous) => [
        ...previous,
        { family, label: file.name.replace(/\.[^.]+$/, "") },
      ]);
      if (revision === fontSelection.current)
        setSettings((previous) => ({ ...previous, fontFamily: family }));
      setToast("字体已载入，可以开始创作了");
    } catch {
      setToast("字体无法读取，请选择 TTF、OTF、WOFF 或 WOFF2 文件");
    }
  }

  /** Capture the current composition at the selected PNG output resolution. */
  async function createPng() {
    if (!image || !fontReady) throw new Error("底图和字体仍在加载");
    const output = document.createElement("canvas");
    // Draw synchronously to preserve the exact composition at the moment of the click.
    renderSticker(output, image, settings, exportScale);
    return canvasToBlob(output);
  }

  /** Download a rendered PNG with its alpha channel preserved. */
  async function download() {
    setExporting(true);
    try {
      const blob = await createPng();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `大肥鱼-${selected?.name.replace(/\.[^.]+$/, "") || "表情包"}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setToast("表情包已下载，去分享你的心情吧");
    } catch {
      setToast("导出失败，请重试");
    } finally {
      setExporting(false);
    }
  }

  /** Copy a PNG while retaining the browser's user-activation permission. */
  async function copy() {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      setToast("当前浏览器不支持复制图片，请使用下载 PNG");
      return;
    }
    setExporting(true);
    try {
      // Passing the Blob promise immediately also supports Safari's activation rules.
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": createPng() }),
      ]);
      setToast("已复制图片，粘贴到聊天框试试");
    } catch {
      setToast("浏览器未允许复制图片，请使用下载 PNG");
    } finally {
      setExporting(false);
    }
  }

  const ready = Boolean(image) && !imageLoading && fontReady;
  return (
    <>
      <header className="app-header">
        <a className="brand" href="./">
          <span className="brand-mark">
            <Fish size={27} strokeWidth={2.1} />
          </span>
          <span>
            <strong>大肥鱼表情工坊</strong>
            <small>BLUE FISH STUDIO</small>
          </span>
          <span className="brand-pill">BETA</span>
        </a>
        <nav>
          <button
            className="about-button"
            onClick={() => aboutRef.current?.showModal()}
          >
            <Info size={17} />
            关于工坊
          </button>
          <span className="nav-divider" />
          <button
            className="icon-button theme-button"
            aria-label={dark ? "切换浅色主题" : "切换深色主题"}
            title={dark ? "切换浅色主题" : "切换深色主题"}
            onClick={() => setDark((value) => !value)}
          >
            {dark ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </nav>
      </header>
      <main className="app-main">
        <section className="intro">
          <div>
            <div className="eyebrow">
              <span />
              一点灵感，一点鱼味
            </div>
            <h1>
              今天，让大肥鱼替你<span>表达。</span>
              <Sparkles className="headline-sparkle" size={28} />
            </h1>
            <p>
              挑一张喜欢的底图，写一句此刻的心情。你的专属表情包，就这么简单。
            </p>
          </div>
          <div className="intro-note">
            <Heart size={16} />
            为每一种小情绪而作
          </div>
        </section>
        <div className="workspace">
          <Gallery
            stickers={[...personalStickers, ...stickers]}
            selectedId={selected?.id || ""}
            onSelect={selectSticker}
            onUpload={() => uploadRef.current?.click()}
            onGenerate={() => setGenerationOpen(true)}
          />
          <section className="preview-panel panel">
            <header className="panel-heading">
              <span className="step-badge">02</span>
              <div>
                <p className="panel-kicker">YOUR LITTLE CANVAS</p>
                <h2>让心情显形</h2>
              </div>
              <span className="live-badge">
                <span />
                实时预览
              </span>
            </header>
            <div className="preview-toolbar">
              <div className="segmented-control" aria-label="底图布局">
                <button
                  className={settings.layout === "caption" ? "active" : ""}
                  aria-pressed={settings.layout === "caption"}
                  onClick={() => updateSettings({ layout: "caption" })}
                >
                  留白配字
                </button>
                <button
                  className={settings.layout === "overlay" ? "active" : ""}
                  aria-pressed={settings.layout === "overlay"}
                  onClick={() => updateSettings({ layout: "overlay" })}
                >
                  叠加文字
                </button>
              </div>
              <span className="canvas-dimensions">512 × 512</span>
            </div>
            <div className="canvas-stage">
              <StickerCanvas
                image={ready ? image : null}
                settings={settings}
                onPositionChange={(x, y) => updateSettings({ x, y })}
                canvasRef={canvasRef}
                loading={imageLoading || !fontReady || !selected}
              />
              {error && (
                <div className="canvas-error" role="alert">
                  {error}
                </div>
              )}
            </div>
            <div className="canvas-caption">
              <span className="current-image-name">
                {selected?.name || "正在准备素材…"}
              </span>
              <span>
                <MousePointer2 size={14} />
                拖动文字，找到刚好的位置
              </span>
            </div>
            {selected && (
              <p className="selected-source">
                <span>
                  {selected.origin === "studio"
                    ? "工坊补充"
                    : selected.origin === "archive"
                      ? "档案馆"
                      : "我的素材"}
                </span>
                {selected.origin === "studio" ? (
                  <>
                    <span>· {selected.sourceNote || "透明底衍生素材"}</span>
                    {selected.sourceId && (
                      <a
                        href={assetUrl(`archive/media/${selected.sourceId}`)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        查看原图
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </>
                ) : selected.origin === "archive" ? (
                  <span>· blue-fish-archive 原图</span>
                ) : (
                  <span>· {selected.sourceNote}</span>
                )}
              </p>
            )}
            {selected?.animated && (
              <p className="animation-note">动图将作为静态底图，导出为 PNG。</p>
            )}
            <div className="output-options">
              <span>画布背景</span>
              <div className="segmented-control background-control">
                <button
                  className={
                    settings.background === "transparent" ? "active" : ""
                  }
                  aria-pressed={settings.background === "transparent"}
                  onClick={() => updateSettings({ background: "transparent" })}
                >
                  <span className="transparency-swatch" />
                  透明
                </button>
                <button
                  className={settings.background === "white" ? "active" : ""}
                  aria-pressed={settings.background === "white"}
                  onClick={() => updateSettings({ background: "white" })}
                >
                  <span className="white-swatch" />
                  白色
                </button>
              </div>
              <label className="export-size">
                <select
                  aria-label="导出分辨率"
                  value={exportScale}
                  onChange={(event) =>
                    setExportScale(Number(event.target.value))
                  }
                >
                  <option value={1}>512 px · 标准</option>
                  <option value={2}>1024 px · 高清</option>
                  <option value={3}>1536 px · 超清</option>
                </select>
                <ChevronDown size={14} />
              </label>
            </div>
            <div className="export-actions">
              <button
                className="button button-outlined"
                disabled={!ready || exporting}
                onClick={() => void copy()}
              >
                <Copy size={18} />
                复制图片
              </button>
              <button
                className="button button-primary"
                disabled={!ready || exporting}
                onClick={() => void download()}
              >
                <Download size={19} />
                {exporting ? "正在生成…" : "下载 PNG"}
                <span className="button-detail">{exportScale}×</span>
              </button>
            </div>
            <p className="local-note">
              <span />
              文字排版与图片导出，在你的浏览器里完成
            </p>
          </section>
          <Editor
            settings={settings}
            fonts={fonts}
            onChange={updateSettings}
            onFontUpload={uploadFont}
            onReset={resetSettings}
          />
        </div>
      </main>
      <nav className="mobile-workshop-nav" aria-label="工坊快捷导航">
        <button onClick={() => jumpToPanel("preview")}>
          <Eye size={20} />
          看预览
        </button>
        <button onClick={() => jumpToPanel("gallery")}>
          <ImagePlus size={20} />
          选底图
        </button>
        <button onClick={() => jumpToPanel("editor")}>
          <Type size={20} />
          写文案
        </button>
      </nav>
      <footer className="app-footer">
        <span>
          <Fish size={16} />
          让每一天，都有一点鱼的快乐。
        </span>
        <div>
          <a
            href="https://github.com/EDMOK/blue-fish-archive"
            target="_blank"
            rel="noreferrer"
          >
            素材来自蓝色大肥鱼档案馆
            <ExternalLink size={12} />
          </a>
          <button onClick={() => aboutRef.current?.showModal()}>
            致谢与来源
          </button>
        </div>
      </footer>
      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => void uploadImage(event)}
      />
      <GenerationDialog
        open={generationOpen}
        onClose={() => setGenerationOpen(false)}
        onUse={useGeneratedImage}
      />
      <dialog
        ref={aboutRef}
        className="about-dialog"
        aria-labelledby="about-title"
      >
        <div className="dialog-heading">
          <span className="brand-mark">
            <Fish size={25} />
          </span>
          <h2 id="about-title">关于大肥鱼表情工坊</h2>
          <button
            className="icon-button"
            aria-label="关闭关于"
            onClick={() => aboutRef.current?.close()}
          >
            <X size={21} />
          </button>
        </div>
        <p>
          一个围绕 DeepSeek
          鲸鱼娘的同人表情包制作器。选底图、写心情，把一点小快乐带进聊天框。
        </p>
        <dl>
          <dt>素材整理</dt>
          <dd>
            <a
              href="https://github.com/EDMOK/blue-fish-archive"
              target="_blank"
              rel="noreferrer"
            >
              EDMOK · 蓝色大肥鱼档案馆
            </a>
          </dd>
          <dt>角色原作</dt>
          <dd>
            <a
              href="https://space.bilibili.com/4456176"
              target="_blank"
              rel="noreferrer"
            >
              上善无形
            </a>
          </dd>
          <dt>女仆形象二次设计</dt>
          <dd>
            <a
              href="https://space.bilibili.com/4168597"
              target="_blank"
              rel="noreferrer"
            >
              ZipZipPipe
            </a>{" "}
            · CC BY-NC-SA 4.0
          </dd>
          <dt>功能与设计参考</dt>
          <dd>
            <a
              href="https://pjsk.moe/zh-cn/sticker-maker/"
              target="_blank"
              rel="noreferrer"
            >
              Moesekai 表情包制作器
            </a>{" "}
            · Material 3
          </dd>
          <dt>手写字体</dt>
          <dd>
            <a
              href="https://github.com/maoken-fonts/MaokenAssortedSans"
              target="_blank"
              rel="noreferrer"
            >
              猫啃什锦黑
            </a>{" "}
            · SIL OFL 1.1
          </dd>
        </dl>
        <p className="dialog-note">
          图片权利归各自创作者；上述 CC BY-NC-SA 4.0
          对应女仆形象二次设计。个人素材与导入的字体保留至页面刷新，收藏保存在本机。生成底图时，提示词与
          API Key 直接发送至你填写的模型服务。
        </p>
        <button
          className="button button-primary"
          onClick={() => aboutRef.current?.close()}
        >
          继续创作
          <Sparkles size={17} />
        </button>
      </dialog>
      {toast && (
        <div className="snackbar" role="status">
          <Check size={18} />
          <span>{toast}</span>
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}
