import type { SiteStats as StatsSnapshot } from "../types";

/** A centered, quiet summary of site-wide counters. */
export default function SiteStats({
  stats,
  unavailable,
}: {
  /** Most recent confirmed server totals, or null during initial loading. */
  stats: StatsSnapshot | null;
  /** Whether the latest read or event request failed. */
  unavailable: boolean;
}) {
  return (
    <p
      className="site-stats"
      role="status"
      title={
        stats
          ? `统计自 ${new Date(stats.startedAt).toLocaleDateString("zh-CN")} 起；下载或复制图片计一次导出${unavailable ? "；当前显示最近一次统计" : ""}`
          : undefined
      }
    >
      {stats ? (
        <>
          <span>
            累计访问 <strong>{stats.visits.toLocaleString("zh-CN")}</strong> 次
          </span>
          <span className="stats-separator" aria-hidden="true">
            ·
          </span>
          <span>
            累计导出 <strong>{stats.exports.toLocaleString("zh-CN")}</strong> 次
          </span>
        </>
      ) : unavailable ? (
        "统计暂不可用"
      ) : (
        "统计加载中…"
      )}
    </p>
  );
}
