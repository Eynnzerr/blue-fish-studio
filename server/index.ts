import { timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILTIN_FONTS, DEFAULT_SETTINGS } from "../src/lib/defaults.ts";
import type { EditorSettings, Sticker } from "../src/types.ts";
import type { RenderJob } from "./render-worker.ts";
import { ApiError, integerSetting, readJson, sendError, sendJson } from "./http.ts";
import { createStatsService } from "./stats-service.ts";

/** Duration of the shared render-rate counting window. */
const RATE_WINDOW_MS = 60_000;
/** Maximum time allowed for open connections to finish during shutdown. */
const SHUTDOWN_GRACE_MS = 10_000;
/** Maximum lifetime of a native rendering process. */
const RENDER_TIMEOUT_MS = 20_000;
/** Bound the encoded image accumulated by the HTTP process. */
const MAX_RENDER_OUTPUT_BYTES = 8 * 1024 * 1024;
/** Stable public font identifiers mapped to the browser's bundled font families. */
const FONT_FAMILIES = {
  maoken: "Maoken",
  "zcool-kuaile": "ZCOOL KuaiLe",
  "zcool-qingke-huangyou": "ZCOOL QingKe HuangYou",
  "ma-shan-zheng": "Ma Shan Zheng",
};
/** Fields intentionally exposed by the render endpoint. */
const RENDER_FIELDS = new Set([
  "stickerId",
  "text",
  "font",
  "color",
  "background",
  "layout",
]);

/** A bundled font and its stable API-facing identity. */
interface ServiceFont {
  /** Stable identifier used in render requests. */
  id: string;
  /** Human-readable font name shared with the editor. */
  name: string;
  /** Font family registered by each isolated rendering process. */
  family: string;
}

/** Validated render input resolved against the bundled catalog. */
interface RenderRequest {
  /** Catalog entry providing the local image path. */
  sticker: Sticker;
  /** Complete drawing settings shared with the browser renderer. */
  settings: EditorSettings;
}

/** Describe bundled fonts without loading native drawing libraries into HTTP memory. */
function describeFonts(): Map<string, ServiceFont> {
  const fonts = new Map<string, ServiceFont>();
  for (const [id, family] of Object.entries(FONT_FAMILIES)) {
    const definition = BUILTIN_FONTS.find((font) => font.family === family);
    if (!definition?.source) throw new Error(`Missing bundled font: ${id}`);
    fonts.set(id, { id, name: definition.label, family });
  }
  return fonts;
}

/** Resolve a catalog-provided relative path within the public asset directory. */
function catalogPath(publicRoot: string, source: string): string {
  if (
    isAbsolute(source) ||
    source.includes("\\") ||
    source.split("/").includes("..") ||
    /^[a-z][a-z0-9+.-]*:/i.test(source)
  ) {
    throw new Error("The bundled catalog contains an invalid image path");
  }
  const path = resolve(publicRoot, source);
  if (!path.startsWith(`${publicRoot}${sep}`)) {
    throw new Error("The bundled catalog contains an invalid image path");
  }
  return path;
}

/** Load metadata only; original image bytes are read on demand for each render. */
async function loadCatalog(publicRoot: string): Promise<Map<string, Sticker>> {
  const manifests = await Promise.all(
    ["stickers.json", "studio/stickers.json"].map(
      async (path) =>
        JSON.parse(
          await readFile(resolve(publicRoot, path), "utf8"),
        ) as Sticker[],
    ),
  );
  const catalog = new Map<string, Sticker>();
  for (const sticker of manifests.flat()) {
    catalogPath(publicRoot, sticker.src);
    catalogPath(publicRoot, sticker.preview);
    catalog.set(sticker.id, sticker);
  }
  return catalog;
}

/** Validate the small render contract and apply the shared editor defaults. */
function validateRender(
  payload: unknown,
  catalog: Map<string, Sticker>,
  fonts: Map<string, ServiceFont>,
): RenderRequest {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new ApiError(400, "INVALID_PARAMETERS", "请求正文必须是 JSON 对象");
  }
  const values = payload as Record<string, unknown>;
  if (Object.keys(values).some((key) => !RENDER_FIELDS.has(key))) {
    throw new ApiError(400, "UNKNOWN_FIELD", "请求包含未支持的字段");
  }
  if (typeof values.stickerId !== "string" || !values.stickerId.trim()) {
    throw new ApiError(400, "INVALID_STICKER_ID", "stickerId 必须是非空字符串");
  }
  if (
    typeof values.text !== "string" ||
    !values.text.trim() ||
    Array.from(values.text).length > 200
  ) {
    throw new ApiError(
      400,
      "INVALID_TEXT",
      "text 必须为非空文本，且不超过 200 个 Unicode 字符",
    );
  }
  const fontId = values.font === undefined ? "maoken" : values.font;
  const font = typeof fontId === "string" ? fonts.get(fontId) : undefined;
  if (!font)
    throw new ApiError(400, "INVALID_FONT", "font 必须是字体列表中的有效 ID");
  const color =
    values.color === undefined ? DEFAULT_SETTINGS.color : values.color;
  if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) {
    throw new ApiError(400, "INVALID_COLOR", "color 必须为 #RRGGBB 格式");
  }
  const background =
    values.background === undefined
      ? DEFAULT_SETTINGS.background
      : values.background;
  if (background !== "transparent" && background !== "white") {
    throw new ApiError(
      400,
      "INVALID_BACKGROUND",
      "background 仅支持 transparent 或 white",
    );
  }
  const layout =
    values.layout === undefined ? DEFAULT_SETTINGS.layout : values.layout;
  if (layout !== "caption" && layout !== "overlay") {
    throw new ApiError(
      400,
      "INVALID_LAYOUT",
      "layout 仅支持 caption 或 overlay",
    );
  }
  const sticker = catalog.get(values.stickerId);
  if (!sticker) throw new ApiError(404, "STICKER_NOT_FOUND", "未找到指定素材");
  return {
    sticker,
    settings: {
      ...DEFAULT_SETTINGS,
      text: values.text,
      fontFamily: font.family,
      color,
      background,
      layout,
    },
  };
}

/** Resolve one to eight catalog IDs in the exact order used for preview numbering. */
function validatePreview(
  payload: unknown,
  catalog: Map<string, Sticker>,
): Sticker[] {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new ApiError(400, "INVALID_PARAMETERS", "请求正文必须是 JSON 对象");
  }
  const values = payload as Record<string, unknown>;
  if (Object.keys(values).some((key) => key !== "stickerIds")) {
    throw new ApiError(400, "UNKNOWN_FIELD", "请求包含未支持的字段");
  }
  if (
    !Array.isArray(values.stickerIds) ||
    values.stickerIds.length < 1 ||
    values.stickerIds.length > 8 ||
    values.stickerIds.some((id) => typeof id !== "string" || !id.trim())
  ) {
    throw new ApiError(
      400,
      "INVALID_STICKER_IDS",
      "stickerIds 必须包含 1 至 8 个非空素材 ID",
    );
  }
  return values.stickerIds.map((id: string) => {
    const sticker = catalog.get(id);
    if (!sticker)
      throw new ApiError(404, "STICKER_NOT_FOUND", "未找到指定素材");
    return sticker;
  });
}

/** Render one validated job in a short-lived process that releases all native memory on exit. */
async function renderIsolatedPng(
  publicRoot: string,
  input: RenderRequest | Sticker[],
): Promise<Buffer> {
  let job: RenderJob;
  if (Array.isArray(input)) {
    const items = [];
    for (const sticker of input) {
      const path = await realpath(catalogPath(publicRoot, sticker.preview));
      if (!path.startsWith(`${publicRoot}${sep}`))
        throw new Error("Image path escapes the public directory");
      items.push({ sticker, imagePath: path });
    }
    job = { kind: "preview", publicRoot, items };
  } else {
    const path = await realpath(catalogPath(publicRoot, input.sticker.src));
    if (!path.startsWith(`${publicRoot}${sep}`))
      throw new Error("Image path escapes the public directory");
    job = { kind: "render", publicRoot, imagePath: path, settings: input.settings };
  }
  return new Promise((resolvePng, rejectPng) => {
    let inputError: Error | undefined;
    const child = execFile(
      process.execPath,
      [
        "--experimental-strip-types",
        "--max-old-space-size=96",
        fileURLToPath(new URL("./render-worker.ts", import.meta.url)),
      ],
      {
        encoding: "buffer",
        timeout: RENDER_TIMEOUT_MS,
        killSignal: "SIGKILL",
        maxBuffer: MAX_RENDER_OUTPUT_BYTES,
      },
      (error, stdout, stderr) => {
        if (inputError) {
          rejectPng(inputError);
          return;
        }
        if (error) {
          rejectPng(
            error.killed
              ? new ApiError(504, "RENDER_TIMEOUT", "图片生成超时，请稍后重试")
              : new Error(stderr.toString().trim() || error.message),
          );
          return;
        }
        resolvePng(stdout);
      },
    );
    child.stdin!.on("error", (error: Error) => {
      // Return the concurrency slot only after execFile confirms the child has closed.
      inputError = error;
      child.kill("SIGKILL");
    });
    child.stdin!.end(JSON.stringify(job));
  });
}

/** Initialize assets and serve private or explicitly enabled public image requests. */
async function main(): Promise<void> {
  const apiKey = process.env.API_KEY?.trim();
  if (!apiKey)
    throw new Error("API_KEY is required to start the image service");
  const host = process.env.HOST || "127.0.0.1";
  const port = integerSetting("PORT", 8787, 65_535);
  const maxConcurrent = integerSetting("MAX_CONCURRENT_RENDERS", 2);
  const rateLimit = integerSetting("RATE_LIMIT_PER_MINUTE", 60);
  /** Permit requests without credentials only when the deployment explicitly enables them. */
  const allowAnonymous = process.env.ALLOW_ANONYMOUS_RENDER === "true";
  /** Public requests share the overall cap while leaving its remaining quota for valid credentials. */
  const publicRateLimit = integerSetting(
    "PUBLIC_RATE_LIMIT_PER_MINUTE",
    rateLimit,
    rateLimit,
  );
  const publicRoot = await realpath(
    fileURLToPath(new URL("../public/", import.meta.url)),
  );
  const fonts = describeFonts();
  const catalog = await loadCatalog(publicRoot);
  const statsService = createStatsService();
  const expectedAuthorization = Buffer.from(`Bearer ${apiKey}`);
  let activeRenders = 0;
  let rendersInWindow = 0;
  /** Count anonymous renders within the same window as the overall quota. */
  let publicRendersInWindow = 0;
  let windowStartedAt = Date.now();
  let closing = false;

  /** Authenticate and dispatch a request without accepting image URLs or file paths. */
  async function handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
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
    if (await statsService.handle(request, response, path)) return;
    const authorization = Buffer.from(request.headers.authorization ?? "");
    // Determine the quota from actual credentials, never from caller-supplied identity hints.
    const isPublicRequest = allowAnonymous && authorization.length === 0;
    if (
      !isPublicRequest &&
      (authorization.length !== expectedAuthorization.length ||
        !timingSafeEqual(authorization, expectedAuthorization))
    ) {
      throw new ApiError(401, "UNAUTHORIZED", "需要有效的 Bearer API Key");
    }
    if (request.method === "GET" && path === "/api/v1/stickers") {
      sendJson(response, 200, {
        stickers: Array.from(
          catalog.values(),
          ({ id, name, origin, tags, animated, featured }) => ({
            id,
            name,
            origin,
            tags,
            animated,
            featured,
          }),
        ),
      });
      return;
    }
    if (request.method === "GET" && path === "/api/v1/fonts") {
      sendJson(response, 200, {
        fonts: Array.from(fonts.values(), ({ id, name }) => ({ id, name })),
      });
      return;
    }
    if (
      request.method !== "POST" ||
      (path !== "/api/v1/render" && path !== "/api/v1/stickers/preview")
    ) {
      throw new ApiError(404, "NOT_FOUND", "接口不存在");
    }
    const payload = await readJson(request);
    const input =
      path === "/api/v1/stickers/preview"
        ? validatePreview(payload, catalog)
        : validateRender(payload, catalog, fonts);
    const now = Date.now();
    if (now - windowStartedAt >= RATE_WINDOW_MS) {
      windowStartedAt = now;
      rendersInWindow = 0;
      publicRendersInWindow = 0;
    }
    if (
      rendersInWindow >= rateLimit ||
      (isPublicRequest && publicRendersInWindow >= publicRateLimit)
    ) {
      response.setHeader(
        "Retry-After",
        String(Math.ceil((windowStartedAt + RATE_WINDOW_MS - now) / 1000)),
      );
      throw new ApiError(429, "RATE_LIMITED", "图片生成请求较多，请稍后重试");
    }
    if (activeRenders >= maxConcurrent) {
      response.setHeader("Retry-After", "2");
      throw new ApiError(503, "RENDER_BUSY", "当前渲染任务已满，请稍后重试");
    }
    // Reserve both limits before awaiting decoding; rejected requests do not consume the render quota.
    rendersInWindow += 1;
    if (isPublicRequest) publicRendersInWindow += 1;
    activeRenders += 1;
    try {
      const png = await renderIsolatedPng(publicRoot, input);
      if (!response.destroyed) {
        response.writeHead(200, {
          "Content-Type": "image/png",
          "Content-Length": png.length,
          "Cache-Control": "no-store",
        });
        response.end(png);
      }
    } finally {
      activeRenders -= 1;
    }
  }

  const server = createServer((request, response) => {
    void handleRequest(request, response).catch((cause: unknown) =>
      sendError(response, cause),
    );
  });

  /** Stop accepting requests and let active responses finish before closing remaining sockets. */
  function shutdown(): void {
    if (closing) return;
    closing = true;
    const timer = setTimeout(
      () => server.closeAllConnections(),
      SHUTDOWN_GRACE_MS,
    );
    timer.unref();
    server.close(() => {
      clearTimeout(timer);
      statsService.close();
    });
  }

  await new Promise<void>((resolveListening, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolveListening();
    });
  });
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  console.log(`Blue Fish image API listening at http://${host}:${port}`);
}

await main().catch((cause: unknown) => {
  console.error(
    cause instanceof Error ? cause.message : "Image service failed to start",
  );
  process.exitCode = 1;
});
