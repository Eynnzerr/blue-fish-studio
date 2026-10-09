import { useCallback, useEffect, useState } from "react";
import type { SiteStats, StatsEventKind } from "../types";

/** Development uses Vite's proxy; published static sites opt in with an API URL. */
const endpoint =
  import.meta.env.VITE_STATS_API_URL?.replace(/\/$/, "") ||
  (import.meta.env.DEV ? "/api/v1/stats" : "");
/** One ID per document load, reused during StrictMode effect setup and request retries. */
const pageViewId = crypto.randomUUID();

/** Read or report counters, retrying one transient failure with the same event ID. */
async function requestStats(event?: {
  id: string;
  kind: StatsEventKind;
}): Promise<SiteStats> {
  for (let attempt = 0; ; attempt += 1) {
    let retryable = true;
    try {
      const response = await fetch(event ? `${endpoint}/events` : endpoint, {
        method: event ? "POST" : "GET",
        headers: event ? { "Content-Type": "application/json" } : undefined,
        body: event ? JSON.stringify(event) : undefined,
        credentials: "omit",
        cache: "no-store",
        keepalive: Boolean(event),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        retryable = response.status >= 500;
        throw new Error(`Statistics request failed: ${response.status}`);
      }
      return (await response.json()) as SiteStats;
    } catch (cause) {
      if (attempt >= 1 || !retryable) throw cause;
      await new Promise((resolve) => window.setTimeout(resolve, 500));
    }
  }
}

/** Keep global footer counters fresh and report exports independently of image creation. */
export function useSiteStats() {
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  /** Older polling responses must not overwrite counters from a newer export response. */
  const applyStats = useCallback((next: SiteStats): void => {
    setStats((previous) =>
      previous && previous.startedAt === next.startedAt
        ? {
            ...next,
            visits: Math.max(previous.visits, next.visits),
            exports: Math.max(previous.exports, next.exports),
          }
        : next,
    );
    setUnavailable(false);
  }, []);

  useEffect(() => {
    if (!endpoint) return;
    let active = true;
    let pageViewRecorded = false;

    /** Update visible counters without surfacing telemetry errors in the editing flow. */
    async function update(event?: {
      id: string;
      kind: StatsEventKind;
    }): Promise<void> {
      try {
        const next = await requestStats(event);
        if (event?.kind === "page_view") pageViewRecorded = true;
        if (active) applyStats(next);
      } catch {
        if (active) setUnavailable(true);
      }
    }

    /** Poll only while visible and refresh after returning to this page. */
    function refresh(): void {
      if (document.visibilityState === "visible") {
        void update(
          pageViewRecorded ? undefined : { id: pageViewId, kind: "page_view" },
        );
      }
    }

    void update({ id: pageViewId, kind: "page_view" });
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [applyStats]);

  /** Each completed copy or download is a distinct export, even for unchanged content. */
  const recordExport = useCallback((): void => {
    if (!endpoint) return;
    void requestStats({ id: crypto.randomUUID(), kind: "export" })
      .then(applyStats)
      .catch(() => setUnavailable(true));
  }, [applyStats]);

  return { enabled: Boolean(endpoint), stats, unavailable, recordExport };
}
