import {
  Check,
  Copy,
  Crop,
  Download,
  ExternalLink,
  Eye,
  Fish,
  Github,
  ImagePlus,
  Info,
  Moon,
  MousePointer2,
  Sparkles,
  Sun,
  Type,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Gallery from "./components/Gallery";
import Editor from "./components/Editor";
import GenerationDialog from "./components/GenerationDialog";
import CropDialog from "./components/CropDialog";
import ExportOptions from "./components/ExportOptions";
import SiteStats from "./components/SiteStats";
import { useSiteStats } from "./lib/site-stats";
import { StickerCanvas } from "./components/StickerCanvas";
import {
  BUILTIN_FONTS,
  DEFAULT_SETTINGS,
  SYSTEM_FONT_FAMILY,
} from "./lib/defaults";
import { canvasToBlob, renderSticker } from "./lib/canvas";
import { EXPORT_FORMATS, readImageFormat } from "./lib/image-formats";
import { CANVAS_SIZE, sizeFromLongestEdge } from "./lib/render";
import type {
  Composition,
  EditorSettings,
  ExportFormat,
  FontOption,
  ImageCrop,
  ImageSize,
  Sticker,
} from "./types";

/** Source of the final canvas aspect ratio. */
type CanvasMode = "square" | "image" | "custom";

/** Resolve a bundled URL for root and subdirectory deployments alike. */
function assetUrl(path: string) {
  return `${import.meta.env.BASE_URL}${path}`;
}

/** Share bundled font downloads across selections and repeated effect setup. */
const builtinFontLoads = new Map<string, Promise<FontFace>>();

/** Load and register one bundled face before it is used by the canvas. */
function loadBuiltinFont(family: string, source: string): Promise<FontFace> {
  const cached = builtinFontLoads.get(family);
  if (cached) return cached;
  const face = new FontFace(family, `url("${assetUrl(source)}")`);
  const pending = face
    .load()
    .then((loaded) => {
      document.fonts.add(loaded);
      return loaded;
    })
    .catch((cause) => {
      builtinFontLoads.delete(family);
      throw cause;
    });
  builtinFontLoads.set(family, pending);
  return pending;
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
  const siteStats = useSiteStats();
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [personalStickers, setPersonalStickers] = useState<Sticker[]>([]);
  const [generationOpen, setGenerationOpen] = useState(false);
  const [selected, setSelected] = useState<Sticker | null>(null);
  const [settings, setSettings] = useState<EditorSettings>({
    ...DEFAULT_SETTINGS,
  });
  const [fonts, setFonts] = useState<FontOption[]>(BUILTIN_FONTS);
  const [readyFontFamily, setReadyFontFamily] = useState<string | null>(null);
  const fontReady = readyFontFamily === settings.fontFamily;
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [crops, setCrops] = useState<Record<string, ImageCrop>>({});
  const [cropOpen, setCropOpen] = useState(false);
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("square");
  const [exportPreset, setExportPreset] = useState<number | null>(1024);
  /** Download encoding; clipboard images always use PNG. */
  const [exportFormat, setExportFormat] = useState<ExportFormat>("png");
  const [customSize, setCustomSize] = useState<ImageSize>({
    width: 1024,
    height: 1024,
  });
  const [sizeLocked, setSizeLocked] = useState(true);
  const [sizeValid, setSizeValid] = useState(true);
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
  const crop = selected ? (crops[selected.id] ?? null) : null;
  const sourceWidth = image?.naturalWidth ?? selected?.width ?? CANVAS_SIZE;
  const sourceHeight = image?.naturalHeight ?? selected?.height ?? CANVAS_SIZE;
  const imageAspect =
    (sourceWidth * (crop?.width ?? 100)) /
    (sourceHeight * (crop?.height ?? 100));
  const aspect =
    canvasMode === "square"
      ? 1
      : canvasMode === "image"
        ? imageAspect
        : customSize.width / customSize.height;
  const composition = useMemo<Composition>(
    () => ({
      width: aspect >= 1 ? CANVAS_SIZE : CANVAS_SIZE * aspect,
      height: aspect >= 1 ? CANVAS_SIZE / aspect : CANVAS_SIZE,
      crop,
    }),
    [aspect, crop],
  );
  const outputSize =
    exportPreset === null && canvasMode === "custom"
      ? customSize
      : sizeFromLongestEdge(
          aspect,
          exportPreset ?? Math.max(customSize.width, customSize.height),
        );
  /** Keep the preview and exported pixels identical when JPEG requires a white background. */
  const canvasSettings = useMemo<EditorSettings>(
    () =>
      exportFormat === "jpeg" ? { ...settings, background: "white" } : settings,
    [settings, exportFormat],
  );

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
    const family = settings.fontFamily;
    const font = BUILTIN_FONTS.find((item) => item.family === family);
    if (!font?.source) {
      setReadyFontFamily(family);
      return;
    }
    loadBuiltinFont(family, font.source)
      .then(() => {
        if (active) setReadyFontFamily(family);
      })
      .catch(() => {
        if (active) {
          setSettings((previous) =>
            previous.fontFamily === family
              ? { ...previous, fontFamily: SYSTEM_FONT_FAMILY }
              : previous,
          );
          setToast(`${font.label}加载失败，已切换系统黑体，可稍后重新选择`);
        }
      });
    return () => {
      active = false;
    };
  }, [settings.fontFamily]);

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
    setSettings({ ...DEFAULT_SETTINGS });
    setToast("已恢复初始排版");
  }

  /** Apply a per-image crop without changing the source or the editable caption. */
  function applyCrop(nextCrop: ImageCrop | null): void {
    if (!selected) return;
    setCrops((previous) => {
      const next = { ...previous };
      if (nextCrop) next[selected.id] = nextCrop;
      else delete next[selected.id];
      return next;
    });
    setCropOpen(false);
  }

  /** Select a canvas aspect source, initializing free dimensions from the current output. */
  function changeCanvasMode(mode: CanvasMode): void {
    setCanvasMode(mode);
    setSizeLocked(mode !== "custom");
    if (mode === "custom") {
      setCustomSize(outputSize);
      setExportPreset(null);
    }
  }

  /** Start custom editing from the currently displayed output dimensions. */
  function changeExportPreset(preset: number | null): void {
    if (preset === null) setCustomSize(outputSize);
    setExportPreset(preset);
  }

  /** Free dimensions change the canvas shape; locked dimensions change resolution only. */
  function changeOutputSize(size: ImageSize): void {
    setCustomSize(size);
    if (!sizeLocked) setCanvasMode("custom");
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
      const format = await readImageFormat(blob);
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
        format,
        preview: url,
        featured: false,
        tags: [],
        selfMade: false,
        animated: format === "GIF",
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
      if (!mounted.current) return;
      document.fonts.add(face);
      setFonts((previous) => [
        ...previous,
        { family, label: file.name.replace(/\.[^.]+$/, "") },
      ]);
      if (revision === fontSelection.current)
        setSettings((previous) => ({ ...previous, fontFamily: family }));
      setToast("字体已载入，可以开始创作了");
    } catch {
      if (mounted.current)
        setToast("字体无法读取，请选择 TTF、OTF、WOFF 或 WOFF2 文件");
    }
  }

  /** Capture the visible composition at the selected output resolution and encoding. */
  async function createImage(format: ExportFormat) {
    if (!image || !fontReady) throw new Error("底图和字体仍在加载");
    if (!sizeValid) throw new Error("请填写有效的导出尺寸");
    const output = document.createElement("canvas");
    // Draw synchronously to preserve the exact composition at the moment of the click.
    renderSticker(output, image, canvasSettings, composition, outputSize);
    return canvasToBlob(output, format);
  }

  /** Download the composition using the selected format and matching filename extension. */
  async function download() {
    setExporting(true);
    try {
      const blob = await createImage(exportFormat);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `大肥鱼-${selected?.name.replace(/\.[^.]+$/, "") || "表情包"}.${EXPORT_FORMATS[exportFormat].extension}`;
      link.click();
      siteStats.recordExport();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setToast("表情包已下载，去分享你的心情吧");
    } catch (cause) {
      setToast(cause instanceof Error ? cause.message : "导出失败，请重试");
    } finally {
      setExporting(false);
    }
  }

  /** Copy a PNG while retaining the browser's user-activation permission. */
  async function copy() {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      setToast("当前浏览器不支持复制图片，请下载图片");
      return;
    }
    setExporting(true);
    try {
      // Passing the Blob promise immediately also supports Safari's activation rules.
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": createImage("png") }),
      ]);
      siteStats.recordExport();
      setToast("已复制图片，粘贴到聊天框试试");
    } catch {
      setToast("浏览器未允许复制图片，请下载图片");
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
            <img
              src={assetUrl("studio/designs/bright-answer.png")}
              alt=""
            />
          </span>
          <strong>大肥鱼表情工坊</strong>
        </a>
        <nav aria-label="网站导航">
          <a
            className="icon-button"
            href="https://github.com/Eynnzerr/blue-fish-studio"
            target="_blank"
            rel="noreferrer"
            aria-label="查看 GitHub 仓库"
            title="查看 GitHub 仓库"
          >
            <Github size={20} aria-hidden="true" />
          </a>
          <button
            className="about-button"
            aria-label="关于工坊"
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
            <h1>
              有话，<span>让鱼说。</span>
              <Sparkles className="headline-sparkle" size={28} />
            </h1>
            <p>大肥鱼已就位，今天配什么词？</p>
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
                <h2>画布</h2>
              </div>
              <span className="canvas-drag-hint">
                <MousePointer2 size={13} />
                拖动文字调整位置
              </span>
            </header>
            <div className="canvas-controls">
              <div className="canvas-control-field">
                <span id="canvas-layout-label">文字布局</span>
                <div
                  className="segmented-control"
                  role="group"
                  aria-labelledby="canvas-layout-label"
                >
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
              </div>
              <div className="canvas-control-field">
                <label htmlFor="canvas-ratio">画布比例</label>
                <select
                  id="canvas-ratio"
                  value={canvasMode}
                  onChange={(event) =>
                    changeCanvasMode(event.target.value as CanvasMode)
                  }
                >
                  <option value="square">正方形</option>
                  <option value="image">跟随底图 / 裁剪</option>
                  <option value="custom">自定义宽高</option>
                </select>
              </div>
            </div>
            <div
              className="canvas-stage"
              style={{
                aspectRatio: aspect,
                maxWidth: Math.min(512, 512 * aspect),
              }}
            >
              <StickerCanvas
                image={ready ? image : null}
                settings={canvasSettings}
                composition={composition}
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
            <div className="canvas-source-heading">
              <div className="canvas-source-info">
                <span className="current-image-name" title={selected?.name}>
                  {selected?.name || "正在准备素材…"}
                </span>
                {selected && (
                  <span className="source-format" title="底图原始格式">
                    {selected.format}
                  </span>
                )}
                {selected && (
                  <span
                    className="selected-source"
                    title={
                      selected.sourceNote ||
                      (selected.origin === "archive"
                        ? "blue-fish-archive 原图"
                        : "透明底衍生素材")
                    }
                  >
                    {selected.origin === "studio"
                      ? "工坊补充"
                      : selected.origin === "archive"
                        ? "档案馆"
                        : "我的素材"}
                  </span>
                )}
                {selected?.origin === "studio" && selected.sourceId && (
                  <a
                    className="canvas-source-link"
                    href={assetUrl(`archive/media/${selected.sourceId}`)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="查看原图"
                    title="查看原图"
                  >
                    <span>查看原图</span>
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
              <div className="canvas-source-actions">
                <button
                  className="text-button crop-button"
                  disabled={!image || imageLoading}
                  onClick={() => setCropOpen(true)}
                >
                  <Crop size={15} />
                  {crop ? "重新裁剪" : "裁剪底图"}
                </button>
                {crop && (
                  <button
                    className="text-button restore-crop-button"
                    onClick={() => applyCrop(null)}
                  >
                    恢复底图
                  </button>
                )}
              </div>
            </div>
            {selected?.animated && (
              <p className="animation-note">动图将作为静态底图，导出为静态图片。</p>
            )}
            <div className="canvas-export" role="group" aria-label="导出图片">
              <div className="output-options">
                <span id="canvas-background-label">画布背景</span>
                <div
                  className="segmented-control background-control"
                  role="group"
                  aria-labelledby="canvas-background-label"
                >
                  <button
                    className={
                      canvasSettings.background === "transparent" ? "active" : ""
                    }
                    aria-pressed={canvasSettings.background === "transparent"}
                    disabled={exportFormat === "jpeg"}
                    onClick={() => updateSettings({ background: "transparent" })}
                  >
                    <span className="transparency-swatch" />
                    透明
                  </button>
                  <button
                    className={
                      canvasSettings.background === "white" ? "active" : ""
                    }
                    aria-pressed={canvasSettings.background === "white"}
                    disabled={exportFormat === "jpeg"}
                    onClick={() => updateSettings({ background: "white" })}
                  >
                    <span className="white-swatch" />
                    白色
                  </button>
                </div>
              </div>
              <ExportOptions
                size={outputSize}
                format={exportFormat}
                onFormatChange={setExportFormat}
                preset={exportPreset}
                locked={sizeLocked}
                aspect={aspect}
                onPresetChange={changeExportPreset}
                onLockedChange={setSizeLocked}
                onSizeChange={changeOutputSize}
                onValidityChange={setSizeValid}
              />
              <div className="export-actions">
                <button
                  className="button button-outlined"
                  title="复制为 PNG 图片"
                  disabled={!ready || exporting || !sizeValid}
                  onClick={() => void copy()}
                >
                  <Copy size={18} />
                  复制图片
                </button>
                <button
                  className="button button-primary"
                  disabled={!ready || exporting || !sizeValid}
                  onClick={() => void download()}
                >
                  <Download size={19} />
                  {exporting
                    ? "正在生成…"
                    : `下载 ${EXPORT_FORMATS[exportFormat].label}`}
                </button>
              </div>
            </div>
            <p className="local-note">
              <span />
              图片在本地处理，做好就能带走。
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
          配文字
        </button>
      </nav>
      <footer className={`app-footer${siteStats.enabled ? " has-stats" : ""}`}>
        <span>
          <Fish size={16} />
          小小表情，大有话说。
        </span>
        {siteStats.enabled && (
          <SiteStats
            stats={siteStats.stats}
            unavailable={siteStats.unavailable}
          />
        )}
        <div>
          <a
            href="https://fisharchive.cc/"
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
      {cropOpen && image && (
        <CropDialog
          key={selected?.id}
          image={image}
          crop={crop}
          onApply={applyCrop}
          onClose={() => setCropOpen(false)}
        />
      )}
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
          鲸鱼娘的同人表情包制作器。用你喜欢的底图，配上你想说的话。
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
          <dt>内置字体</dt>
          <dd>
            <a
              href="https://github.com/maoken-fonts/MaokenAssortedSans"
              target="_blank"
              rel="noreferrer"
            >
              猫啃什锦黑
            </a>
            、
            <a
              href="https://fonts.google.com/specimen/ZCOOL+KuaiLe"
              target="_blank"
              rel="noreferrer"
            >
              站酷快乐体
            </a>
            、
            <a
              href="https://fonts.google.com/specimen/ZCOOL+QingKe+HuangYou"
              target="_blank"
              rel="noreferrer"
            >
              站酷庆科黄油体
            </a>
            、
            <a
              href="https://fonts.google.com/specimen/Ma+Shan+Zheng"
              target="_blank"
              rel="noreferrer"
            >
              马善政毛笔手写
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
