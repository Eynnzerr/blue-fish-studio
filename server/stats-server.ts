import { createServer } from "node:http";
import { ApiError, integerSetting, sendError, sendJson } from "./http.ts";
import { createStatsService } from "./stats-service.ts";

/** Run website statistics without loading image rendering, fonts or gallery assets. */
async function main(): Promise<void> {
  const host = process.env.HOST || "127.0.0.1";
  const port = integerSetting("PORT", 8791, 65_535);
  const stats = createStatsService();
  let closing = false;
  const server = createServer((request, response) => {
    /** Route only health checks and the shared public statistics API. */
    async function handle(): Promise<void> {
      let path: string;
      try {
        path = new URL(request.url ?? "/", "http://localhost").pathname;
      } catch {
        throw new ApiError(400, "INVALID_URL", "请求地址无效");
      }
      if (request.method === "GET" && path === "/healthz") {
        sendJson(response, 200, { status: "ok" });
        return;
      }
      if (closing) throw new ApiError(503, "SHUTTING_DOWN", "服务正在关闭");
      if (!(await stats.handle(request, response, path)))
        throw new ApiError(404, "NOT_FOUND", "接口不存在");
    }
    void handle().catch((cause: unknown) => sendError(response, cause));
  });

  /** Finish active HTTP requests before releasing the persistent database. */
  function shutdown(): void {
    if (closing) return;
    closing = true;
    const timer = setTimeout(() => server.closeAllConnections(), 10_000);
    timer.unref();
    server.close(() => {
      clearTimeout(timer);
      stats.close();
    });
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  console.log(`Blue Fish statistics listening at http://${host}:${port}`);
}

await main().catch((cause: unknown) => {
  console.error(
    cause instanceof Error ? cause.message : "Statistics service failed to start",
  );
  process.exitCode = 1;
});
