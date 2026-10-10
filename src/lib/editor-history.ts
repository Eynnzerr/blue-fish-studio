import { useCallback, useRef, useState } from "react";
import { DEFAULT_SETTINGS } from "./defaults";
import type { EditorSettings, ExportFormat, ImageCrop, ImageSize } from "../types";

/** Editable workshop state shared by undo history and saved drafts. */
export interface WorkshopDocument {
  /** Selected bundled or personal image identifier. */
  selectedId: string | null;
  /** Caption styling, position, and canvas background. */
  settings: EditorSettings;
  /** Non-destructive source selections indexed by image identifier. */
  crops: Record<string, ImageCrop>;
  /** Source of the canvas aspect ratio. */
  canvasMode: "square" | "image" | "custom";
  /** Longest-edge export preset, or null for custom dimensions. */
  exportPreset: number | null;
  /** Image encoding used for downloads. */
  exportFormat: ExportFormat;
  /** Dimensions retained while editing custom output sizes. */
  customSize: ImageSize;
  /** Whether custom dimensions retain the current canvas aspect. */
  sizeLocked: boolean;
}

/** A document update; settings and dimensions merge, while crops replace their map. */
export type WorkshopPatch = Partial<
  Omit<WorkshopDocument, "settings" | "customSize">
> & {
  /** Caption fields to merge into the current settings. */
  settings?: Partial<EditorSettings>;
  /** Output dimensions to merge into the current size. */
  customSize?: Partial<ImageSize>;
};

/** Document updates can derive their patch from the latest state synchronously. */
type DocumentUpdate =
  | WorkshopPatch
  | ((current: WorkshopDocument) => WorkshopPatch);

/** Public snapshot and controls for a single workshop editing session. */
export interface EditorHistory {
  /** Current document; update through the hook instead of mutating it. */
  document: WorkshopDocument;
  /** Whether an earlier document can be restored. */
  canUndo: boolean;
  /** Whether an undone document can be restored. */
  canRedo: boolean;
  /** Apply a patch, optionally merging nearby edits with the same group key. */
  update: (patch: DocumentUpdate, group?: string) => void;
  /** End any gesture and restore the previous document. */
  undo: () => void;
  /** End any gesture and restore the next document if it is still available. */
  redo: () => void;
  /** Start a gesture whose updates become one history step; repeated calls are ignored. */
  beginTransaction: () => void;
  /** Finish a gesture and break any time-based edit group. */
  endTransaction: () => void;
  /** Load a document and discard the previous session's undo and redo steps. */
  restore: (document: WorkshopDocument) => void;
}

/** Maximum number of documents available through undo. */
const HISTORY_LIMIT = 100;
/** Maximum pause between edits belonging to the same typing group. */
const GROUP_INTERVAL_MS = 700;

/** Mutable history bookkeeping; React receives only the current public snapshot. */
interface HistoryState {
  /** Most recent document, updated before React renders. */
  document: WorkshopDocument;
  /** Previous documents, with the most recent entry last. */
  past: WorkshopDocument[];
  /** Undone documents, with the next redo entry last. */
  future: WorkshopDocument[];
  /** Document at the start of an active pointer or slider gesture. */
  transactionBase: WorkshopDocument | null;
  /** Group key of the latest committed edit. */
  group: string | undefined;
  /** Timestamp of the latest committed edit. */
  editedAt: number;
}

/** Create independent defaults for a new workshop document. */
export function createInitialDocument(): WorkshopDocument {
  return {
    selectedId: null,
    settings: { ...DEFAULT_SETTINGS },
    crops: {},
    canvasMode: "square",
    exportPreset: 1024,
    exportFormat: "png",
    customSize: { width: 1024, height: 1024 },
    sizeLocked: true,
  };
}

/** Compare editable values without treating replacement objects as new edits. */
function documentsEqual(left: WorkshopDocument, right: WorkshopDocument): boolean {
  if (
    left.selectedId !== right.selectedId ||
    left.canvasMode !== right.canvasMode ||
    left.exportPreset !== right.exportPreset ||
    left.exportFormat !== right.exportFormat ||
    left.sizeLocked !== right.sizeLocked ||
    left.customSize.width !== right.customSize.width ||
    left.customSize.height !== right.customSize.height ||
    Object.entries(left.settings).some(
      ([key, value]) => value !== right.settings[key as keyof EditorSettings],
    ) ||
    Object.keys(left.crops).length !== Object.keys(right.crops).length
  ) {
    return false;
  }

  return Object.entries(left.crops).every(([id, crop]) => {
    const next = right.crops[id];
    return (
      next !== undefined &&
      crop.x === next.x &&
      crop.y === next.y &&
      crop.width === next.width &&
      crop.height === next.height
    );
  });
}

/** Commit a completed gesture only when its final document differs from its start. */
function finishTransaction(history: HistoryState): void {
  const base = history.transactionBase;
  history.transactionBase = null;
  history.group = undefined;
  history.editedAt = 0;
  if (!base || documentsEqual(base, history.document)) return;
  history.past = [...history.past, base].slice(-HISTORY_LIMIT);
  history.future = [];
}

/** Build the React snapshot, including changes in a gesture that has not ended yet. */
function historySnapshot(history: HistoryState) {
  const pending =
    history.transactionBase !== null &&
    !documentsEqual(history.transactionBase, history.document);
  return {
    document: history.document,
    canUndo: history.past.length > 0 || pending,
    canRedo: history.future.length > 0 && !pending,
  };
}

/** Keep up to 100 undo steps, coalescing typing and explicit gestures independently. */
export function useEditorHistory(initialDocument: WorkshopDocument): EditorHistory {
  const historyRef = useRef<HistoryState>({
    document: initialDocument,
    past: [],
    future: [],
    transactionBase: null,
    group: undefined,
    editedAt: 0,
  });
  const [snapshot, setSnapshot] = useState(() =>
    historySnapshot(historyRef.current),
  );

  /** Publish ref changes after every synchronous history operation. */
  const publish = useCallback(() => {
    setSnapshot(historySnapshot(historyRef.current));
  }, []);

  /** Merge a patch against the latest document and record its editing boundary. */
  const update = useCallback(
    (patch: DocumentUpdate, group?: string) => {
      const history = historyRef.current;
      const current = history.document;
      const changes = typeof patch === "function" ? patch(current) : patch;
      const next: WorkshopDocument = {
        ...current,
        ...changes,
        settings: changes.settings
          ? { ...current.settings, ...changes.settings }
          : current.settings,
        customSize: changes.customSize
          ? { ...current.customSize, ...changes.customSize }
          : current.customSize,
      };
      if (documentsEqual(current, next)) return;

      if (!history.transactionBase) {
        const now = Date.now();
        const merged =
          group !== undefined &&
          group === history.group &&
          now - history.editedAt <= GROUP_INTERVAL_MS;
        const groupStart = merged ? history.past.at(-1) : undefined;
        if (groupStart && documentsEqual(groupStart, next)) {
          // Returning to the group's starting value leaves no operation to undo.
          history.past.pop();
          history.group = undefined;
          history.editedAt = 0;
        } else {
          if (!merged) history.past = [...history.past, current].slice(-HISTORY_LIMIT);
          history.group = group;
          history.editedAt = now;
        }
        history.future = [];
      }
      history.document = next;
      publish();
    },
    [publish],
  );

  /** Capture a gesture's starting document without adding an empty undo step. */
  const beginTransaction = useCallback(() => {
    const history = historyRef.current;
    if (history.transactionBase) return;
    history.transactionBase = history.document;
    history.group = undefined;
    history.editedAt = 0;
  }, []);

  /** Commit the gesture's final state and stop merging nearby typing edits. */
  const endTransaction = useCallback(() => {
    finishTransaction(historyRef.current);
    publish();
  }, [publish]);

  /** Move backward after committing any pending gesture as a single step. */
  const undo = useCallback(() => {
    const history = historyRef.current;
    finishTransaction(history);
    const previous = history.past.pop();
    if (previous) {
      history.future.push(history.document);
      history.document = previous;
    }
    publish();
  }, [publish]);

  /** Move forward only if no new edit has replaced the undone branch. */
  const redo = useCallback(() => {
    const history = historyRef.current;
    finishTransaction(history);
    const next = history.future.pop();
    if (next) {
      history.past = [...history.past, history.document].slice(-HISTORY_LIMIT);
      history.document = next;
    }
    publish();
  }, [publish]);

  /** Replace the current document and all history when opening a saved draft. */
  const restore = useCallback((document: WorkshopDocument) => {
    historyRef.current = {
      document,
      past: [],
      future: [],
      transactionBase: null,
      group: undefined,
      editedAt: 0,
    };
    publish();
  }, [publish]);

  return {
    ...snapshot,
    update,
    undo,
    redo,
    beginTransaction,
    endTransaction,
    restore,
  };
}
