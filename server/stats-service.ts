import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { ApiError, integerSetting, readJson, sendJson } from "./http.ts";
import { StatsStore } from "./stats.ts";

/** Duration of the statistics request-count window. */
const RATE_WINDOW_MS = 60_000;

/** Statistics routes shared by the image API and the lightweight standalone service. */
export interface StatsService {
  /** Handle a normalized request path and report whether it is a statistics route. */
  handle(
    request: IncomingMessage,
    response: ServerResponse,
    path: string,
  ): Promise<boolean>;
  /** Close SQLite after the HTTP server has finished all active requests. */
  close(): void;
}

/** Initialize durable counters, browser origins and per-peer request limits. */
export function createStatsService(): StatsService {
  const statsRateLimit = integerSetting("STATS_RATE_LIMIT_PER_MINUTE", 120);
  const statsOrigins = new Set(
    (
      process.env.STATS_ALLOWED_ORIGINS ??
      "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174"
    )
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
      .map((origin) => new URL(origin).origin),
  );
  const statsStore = new StatsStore(
    resolve(process.env.STATS_DB_PATH || "data/stats.sqlite"),
  );
  const statsRequests = new Map<string, number>();
  let statsWindowStartedAt = Date.now();

  /** Apply origin checks, event validation and idempotent counter updates. */
  async function handle(
    request: IncomingMessage,
    response: ServerResponse,
    path: string,
  ): Promise<boolean> {
    if (path === "/api/v1/stats" || path === "/api/v1/stats/events") {
      const origin = request.headers.origin;
      response.setHeader("Vary", "Origin");
      if (
        (origin && !statsOrigins.has(origin)) ||
        (request.method !== "GET" && !origin)
      ) {
        throw new ApiError(403, "ORIGIN_NOT_ALLOWED", "当前网站未启用统计上报");
      }
      if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
      if (request.method === "OPTIONS") {
        response.writeHead(204, {
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "600",
        });
        response.end();
        return true;
      }
      const now = Date.now();
      if (now - statsWindowStartedAt >= RATE_WINDOW_MS) {
        statsWindowStartedAt = now;
        statsRequests.clear();
      }
      // Use the direct peer address; forwarding headers require a trusted proxy configuration.
      const address = request.socket.remoteAddress ?? "unknown";
      const count = statsRequests.get(address) ?? 0;
      if (count >= statsRateLimit) {
        response.setHeader(
          "Retry-After",
          String(
            Math.ceil((statsWindowStartedAt + RATE_WINDOW_MS - now) / 1000),
          ),
        );
        throw new ApiError(
          429,
          "STATS_RATE_LIMITED",
          "统计请求过于频繁，请稍后重试",
        );
      }
      statsRequests.set(address, count + 1);
      if (request.method === "GET" && path === "/api/v1/stats") {
        sendJson(response, 200, statsStore.read());
        return true;
      }
      if (request.method !== "POST" || path !== "/api/v1/stats/events") {
        throw new ApiError(
          405,
          "METHOD_NOT_ALLOWED",
          "统计接口不支持此请求方式",
        );
      }
      const payload = await readJson(request);
      if (
        typeof payload !== "object" ||
        payload === null ||
        Array.isArray(payload)
      ) {
        throw new ApiError(
          400,
          "INVALID_STATS_EVENT",
          "统计事件必须是 JSON 对象",
        );
      }
      const event = payload as Record<string, unknown>;
      if (
        Object.keys(event).some((key) => key !== "id" && key !== "kind") ||
        typeof event.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          event.id,
        ) ||
        (event.kind !== "page_view" && event.kind !== "export")
      ) {
        throw new ApiError(
          400,
          "INVALID_STATS_EVENT",
          "需要 UUID 事件 ID 与 page_view 或 export 类型",
        );
      }
      sendJson(
        response,
        200,
        statsStore.record(event.id.toLowerCase(), event.kind),
      );
      return true;
    }
    return false;
  }

  return { handle, close: statsStore.close.bind(statsStore) };
}
