import type { WorkshopDocument } from "./editor-history";
import type { Sticker } from "../types";

/** Personal-image metadata that survives a refresh without a temporary Blob URL. */
export type DraftSticker = Omit<Sticker, "src" | "preview" | "origin"> & {
  /** Personal collection whose original file is retained in the draft. */
  origin: "upload" | "generated";
};

/** An immutable imported image, identified by its sticker ID. */
export interface StoredDraftImage {
  /** Gallery labels and original dimensions, excluding session-only URLs. */
  sticker: DraftSticker;
  /** Original uploaded or generated image bytes. */
  blob: Blob;
}

/** An immutable imported font, identified by its registered family. */
export interface StoredDraftFont {
  /** CSS family to register again when restoring the draft. */
  family: string;
  /** Font name shown in the editor. */
  label: string;
  /** Original font file used to recreate a FontFace. */
  blob: Blob;
}

/** Complete local draft; bundled images and fonts are referenced by identifier only. */
export interface StoredDraft {
  /** Current editable composition, independent of loaded browser resources. */
  document: WorkshopDocument;
  /** Last edit time as milliseconds since the Unix epoch. */
  updatedAt: number;
  /** Original file for the selected personal image; empty for a bundled image. */
  images: StoredDraftImage[];
  /** Original file for the selected custom font; empty for a bundled or system font. */
  fonts: StoredDraftFont[];
}

/** Lightweight current record; asset bytes live in separate object stores. */
interface DraftRecord {
  /** Current editable composition. */
  document: WorkshopDocument;
  /** Last edit time as milliseconds since the Unix epoch. */
  updatedAt: number;
  /** Personal-image identifiers required by this composition. */
  imageIds: string[];
  /** Custom-font families required by this composition. */
  fontFamilies: string[];
}

/** Stores are committed together so a composition never refers to a partial import. */
const STORES = ["draft", "images", "fonts"];
/** Keep saves in invocation order, including overlapping React effect executions. */
let saveQueue: Promise<void> = Promise.resolve();

/** Open a short-lived connection; callers close it when their transaction settles. */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("blue-fish-workshop", 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      request.result.createObjectStore("draft");
      request.result.createObjectStore("images", { keyPath: "sticker.id" });
      request.result.createObjectStore("fonts", { keyPath: "family" });
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error("草稿存储被其他页面占用，请关闭其他工坊页面后刷新"));
    };
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) {
        database.close();
        return;
      }
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

/** Resolve after all requests commit, or expose the storage error to the UI. */
function transactionFinished(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("草稿存储操作未完成"));
  });
}

/** Read the current atomic snapshot, reporting any missing image or font file. */
export async function readDraft(): Promise<StoredDraft | null> {
  await saveQueue;
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORES, "readonly");
    const completed = transactionFinished(transaction);
    const current = transaction.objectStore("draft").get("current");
    const images = transaction.objectStore("images").getAll();
    const fonts = transaction.objectStore("fonts").getAll();
    await completed;
    const record = current.result as DraftRecord | undefined;
    if (!record) return null;
    return {
      document: record.document,
      updatedAt: record.updatedAt,
      images: record.imageIds.map((id) => {
        const image = (images.result as StoredDraftImage[]).find(
          (item) => item.sticker.id === id,
        );
        if (!image?.blob) throw new Error("草稿缺少底图文件，无法恢复");
        return image;
      }),
      fonts: record.fontFamilies.map((family) => {
        const font = (fonts.result as StoredDraftFont[]).find(
          (item) => item.family === family,
        );
        if (!font?.blob) throw new Error("草稿缺少自定义字体文件，无法恢复");
        return font;
      }),
    };
  } finally {
    database.close();
  }
}

/** Add missing immutable assets and remove imports excluded from this snapshot. */
function syncAssets<T>(
  store: IDBObjectStore,
  assets: T[],
  keyOf: (asset: T) => string,
): void {
  const included = new Set(assets.map(keyOf));
  const keys = store.getAllKeys();
  keys.onsuccess = () => {
    const existing = new Set(keys.result);
    for (const key of existing) {
      if (!included.has(String(key))) store.delete(key);
    }
    for (const asset of assets) {
      if (!existing.has(keyOf(asset))) store.put(asset);
    }
  };
}

/** Commit a composition and its required imports without rewriting unchanged Blobs. */
async function writeDraft(draft: StoredDraft): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORES, "readwrite");
    const completed = transactionFinished(transaction);
    const record: DraftRecord = {
      document: draft.document,
      updatedAt: draft.updatedAt,
      imageIds: draft.images.map((image) => image.sticker.id),
      fontFamilies: draft.fonts.map((font) => font.family),
    };
    transaction.objectStore("draft").put(record, "current");
    syncAssets(transaction.objectStore("images"), draft.images, (image) => image.sticker.id);
    syncAssets(transaction.objectStore("fonts"), draft.fonts, (font) => font.family);
    await completed;
  } finally {
    database.close();
  }
}

/**
 * Save the latest local draft in call order, rejecting storage errors.
 * Image IDs and font families must identify immutable files and metadata; importing
 * a replacement uses a new identifier. Blob URLs and provider credentials are excluded.
 */
export async function saveDraft(draft: StoredDraft): Promise<void> {
  const snapshot = structuredClone(draft);
  const pending = saveQueue.then(() => writeDraft(snapshot));
  saveQueue = pending.catch(() => {});
  await pending;
}
