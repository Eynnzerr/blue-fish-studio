import { useEffect, useMemo, useState } from "react";
import { Check, Heart, ImagePlus, Plus, Search, Sparkles } from "lucide-react";
import type { Sticker } from "../types";

/** Inputs for browsing and selecting locally available fish artwork. */
interface GalleryProps {
  /** Bundled images and personal images available in the current session. */
  stickers: Sticker[];
  /** Identifier of the image currently shown on the canvas. */
  selectedId: string;
  /** Select an image as the editor background. */
  onSelect: (sticker: Sticker) => void;
  /** Open the image picker supplied by the editor. */
  onUpload: () => void;
  /** Open the image generation dialog supplied by the editor. */
  onGenerate: () => void;
}

/** The four available views of the image collection. */
type GalleryTab = "featured" | "all" | "selfMade" | "favorites";

/** Source collection applied alongside the gallery tab and search query. */
type GallerySource = "all" | "archive" | "studio" | "personal";

const PAGE_SIZE = 48;
const FAVORITES_KEY = "blue-fish-studio:favorites";
const TABS: { id: GalleryTab; label: string }[] = [
  { id: "featured", label: "精选" },
  { id: "all", label: "全部" },
  { id: "selfMade", label: "自作" },
  { id: "favorites", label: "收藏" },
];
const SOURCES: { id: GallerySource; label: string }[] = [
  { id: "all", label: "所有来源" },
  { id: "archive", label: "档案馆" },
  { id: "studio", label: "工坊补充" },
  { id: "personal", label: "我的素材" },
];

/** Identify personal images supplied or created by the current user. */
function isPersonalSticker(sticker: Sticker): boolean {
  return sticker.origin === "generated" || sticker.origin === "upload";
}

/** Restore saved image identifiers; unavailable browser storage starts empty. */
function readFavorites(): Set<string> {
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(FAVORITES_KEY) ?? "[]",
    );
    return new Set(
      Array.isArray(saved)
        ? saved.filter((id): id is string => typeof id === "string")
        : [],
    );
  } catch {
    // Some browser privacy settings disable access to localStorage entirely.
    return new Set();
  }
}

/** Search, filter, favorite, and select artwork for the sticker canvas. */
export default function Gallery({
  stickers,
  selectedId,
  onSelect,
  onUpload,
  onGenerate,
}: GalleryProps) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<GalleryTab>("featured");
  const [source, setSource] = useState<GallerySource>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [favorites, setFavorites] = useState<Set<string>>(readFavorites);
  const [storageMessage, setStorageMessage] = useState("");
  const archiveCount = stickers.filter(
    (sticker) => sticker.origin === "archive",
  ).length;
  const studioCount = stickers.filter(
    (sticker) => sticker.origin === "studio",
  ).length;
  const personalCount = stickers.filter(isPersonalSticker).length;
  const selectedIsPersonal = stickers.some(
    (sticker) => sticker.id === selectedId && isPersonalSticker(sticker),
  );

  useEffect(() => {
    // React only to selection changes so browsing another source remains possible.
    if (selectedIsPersonal) {
      setSource("personal");
      setTab("all");
      setQuery("");
      setVisibleCount(PAGE_SIZE);
    }
  }, [selectedId, selectedIsPersonal]);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
      setStorageMessage("");
    } catch {
      setStorageMessage("浏览器未允许保存，收藏会保留到本次页面关闭。");
    }
  }, [favorites]);

  const filteredStickers = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return stickers.filter((sticker) => {
      const matchesTab =
        tab === "all" ||
        (tab === "featured" && sticker.featured) ||
        (tab === "selfMade" && sticker.selfMade) ||
        (tab === "favorites" &&
          !isPersonalSticker(sticker) &&
          favorites.has(sticker.id));
      const matchesSearch =
        !term ||
        [sticker.name, sticker.id, ...sticker.tags]
          .join(" ")
          .toLocaleLowerCase()
          .includes(term);
      const matchesSource =
        source === "all" ||
        (source === "personal"
          ? isPersonalSticker(sticker)
          : sticker.origin === source);
      return matchesTab && matchesSearch && matchesSource;
    });
  }, [stickers, query, tab, source, favorites]);

  /** Toggle a favorite without changing the image selected in the editor. */
  function toggleFavorite(id: string) {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const shownStickers = filteredStickers.slice(0, visibleCount);
  const remainingCount = filteredStickers.length - shownStickers.length;

  return (
    <section className="gallery-panel" aria-labelledby="gallery-title">
      <header className="panel-heading">
        <span className="step-badge" aria-hidden="true">
          01
        </span>
        <div>
          <h2 id="gallery-title">底图库</h2>
          <p className="gallery-count">
            {archiveCount.toLocaleString("zh-CN")} 档案馆 ·{" "}
            {studioCount.toLocaleString("zh-CN")} 工坊补充
            <span className="gallery-personal-count">
              {" "}
              · {personalCount.toLocaleString("zh-CN")} 我的素材
            </span>
          </p>
        </div>
      </header>

      <div className="gallery-create-actions">
        <button
          type="button"
          className="button button-tonal"
          onClick={onGenerate}
        >
          <Sparkles size={18} aria-hidden="true" />
          生成底图
        </button>
        <button
          type="button"
          className="button button-primary"
          onClick={onUpload}
        >
          <ImagePlus size={18} aria-hidden="true" />
          上传图片
        </button>
      </div>

      <label className="search-field">
        <Search size={19} aria-hidden="true" />
        <input
          type="search"
          value={query}
          placeholder="搜索底图、标签…"
          aria-label="搜索素材名称、文件名或标签"
          onChange={(event) => {
            setQuery(event.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
        />
      </label>

      <div className="gallery-tabs" aria-label="素材分类">
        {TABS.map((item) => (
          <button
            type="button"
            key={item.id}
            className={`gallery-tab${tab === item.id ? " active" : ""}`}
            aria-pressed={tab === item.id}
            title={
              item.id === "selfMade" ? "档案馆馆长 EDMOK 的自作素材" : undefined
            }
            aria-label={
              item.id === "selfMade" ? "馆长自作：来自 EDMOK 的素材" : undefined
            }
            onClick={() => {
              setTab(item.id);
              setVisibleCount(PAGE_SIZE);
            }}
          >
            {item.id === "favorites" && <Heart size={15} aria-hidden="true" />}
            {item.label}
          </button>
        ))}
      </div>

      <div className="gallery-source-filter" role="group" aria-label="素材来源">
        {SOURCES.map((item) => (
          <button
            type="button"
            key={item.id}
            className={`gallery-source-button${source === item.id ? " active" : ""}`}
            aria-pressed={source === item.id}
            onClick={() => {
              setSource(item.id);
              setVisibleCount(PAGE_SIZE);
              if (item.id === "personal") {
                setTab("all");
                setQuery("");
              }
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {source === "personal" && (
        <p className="gallery-session-note">
          当前草稿使用的底图会自动保存在本机，其余素材仅在本次页面保留。
        </p>
      )}

      <div className="gallery-grid">
        {shownStickers.map((sticker) => {
          const selected = sticker.id === selectedId;
          const favorite = favorites.has(sticker.id);
          const personal = isPersonalSticker(sticker);
          return (
            <div
              className={`sticker-tile${selected ? " selected" : ""}`}
              key={sticker.id}
            >
              <button
                type="button"
                className="sticker-select"
                aria-label={`选择底图：${sticker.name}`}
                aria-pressed={selected}
                title={sticker.name}
                onClick={() => onSelect(sticker)}
              >
                <img
                  className="sticker-thumb"
                  src={sticker.preview}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  width={sticker.width}
                  height={sticker.height}
                />
                <span className="source-format sticker-format" title="底图原始格式">
                  {sticker.format}
                </span>
                <span className="sticker-label">{sticker.name}</span>
                <span
                  className={`sticker-origin-badge origin-${personal ? "personal" : sticker.origin}`}
                  title={sticker.sourceNote}
                >
                  {personal
                    ? "我的素材"
                    : sticker.origin === "studio"
                      ? "工坊补充"
                      : "档案馆"}
                </span>
                {selected && (
                  <Check
                    className="sticker-check"
                    size={15}
                    aria-hidden="true"
                  />
                )}
              </button>
              {!personal && (
                <button
                  type="button"
                  className={`favorite-button${favorite ? " is-favorite" : ""}`}
                  aria-label={`${favorite ? "取消收藏" : "收藏"}：${sticker.name}`}
                  aria-pressed={favorite}
                  title={favorite ? "取消收藏" : "收藏这只鱼"}
                  onClick={() => toggleFavorite(sticker.id)}
                >
                  <Heart
                    size={15}
                    fill={favorite ? "currentColor" : "none"}
                    aria-hidden="true"
                  />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {filteredStickers.length === 0 && (
        <div className="gallery-empty" role="status">
          {source === "personal" && personalCount === 0 ? (
            <>
              <ImagePlus size={28} aria-hidden="true" />
              <strong>这里等着你的大肥鱼</strong>
              <p>生成或上传的底图，都会出现在“我的素材”里。</p>
            </>
          ) : tab === "favorites" && !query.trim() && source === "all" ? (
            <>
              <Heart size={28} aria-hidden="true" />
              <strong>还没有收藏的大肥鱼</strong>
              <p>点一下素材上的爱心，把喜欢的鱼留在这里。</p>
            </>
          ) : (
            <>
              <Search size={28} aria-hidden="true" />
              <strong>
                {query.trim() ? "这次没有找到合适的鱼" : "当前筛选下还没有素材"}
              </strong>
              <p>
                {query.trim()
                  ? "换个关键词，或切换到“全部”和“所有来源”找找。"
                  : "试试其他分类或来源，也可以上传自己的图片。"}
              </p>
            </>
          )}
        </div>
      )}

      {remainingCount > 0 && (
        <button
          type="button"
          className="button button-tonal load-more"
          onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
        >
          <Plus size={17} aria-hidden="true" />
          再看 {Math.min(PAGE_SIZE, remainingCount)} 张
          <span className="gallery-count">
            还有 {remainingCount.toLocaleString("zh-CN")} 张
          </span>
        </button>
      )}

      {query.trim() && filteredStickers.length > 0 && (
        <p className="gallery-count" role="status">
          找到 {filteredStickers.length.toLocaleString("zh-CN")} 张素材
        </p>
      )}
      {storageMessage && (
        <p className="gallery-count" role="status">
          {storageMessage}
        </p>
      )}
    </section>
  );
}
