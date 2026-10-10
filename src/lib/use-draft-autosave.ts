import { useEffect, useRef, useState } from "react";
import { saveDraft, type StoredDraft } from "./drafts";

/** Visible state of the current composition's local save. */
export type DraftSaveStatus = "loading" | "saving" | "saved" | "error";

/** Save after a short pause and flush pending changes when leaving the page. */
export function useDraftAutosave(draft: StoredDraft, enabled: boolean) {
  const [status, setStatus] = useState<DraftSaveStatus>("loading");
  const [error, setError] = useState("");
  const revision = useRef(0);
  const pendingSave = useRef<(() => void) | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    /** Commit the latest pending snapshot before the browser hides this document. */
    function flush() {
      pendingSave.current?.();
    }
    /** Backgrounding a mobile browser also commits changes before a later suspension. */
    function visibilityChanged() {
      if (document.visibilityState === "hidden") flush();
    }
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      flush();
      mounted.current = false;
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !draft.document.selectedId) return;
    const currentRevision = ++revision.current;
    setStatus("saving");
    setError("");
    let timer: number;
    /** Queue this immutable snapshot once, whether called by the timer or page exit. */
    function persist() {
      if (pendingSave.current !== persist) return;
      pendingSave.current = null;
      window.clearTimeout(timer);
      void saveDraft(draft).then(
        () => {
          if (mounted.current && revision.current === currentRevision)
            setStatus("saved");
        },
        (cause: unknown) => {
          if (mounted.current && revision.current === currentRevision) {
            setStatus("error");
            setError(cause instanceof Error ? cause.message : "浏览器未能保存草稿");
          }
        },
      );
    }
    pendingSave.current = persist;
    timer = window.setTimeout(persist, 300);
    return () => {
      window.clearTimeout(timer);
      if (pendingSave.current === persist) pendingSave.current = null;
    };
  }, [draft, enabled]);

  return { status, error };
}
