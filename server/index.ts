import { timingSafeEqual } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { BUILTIN_FONTS, DEFAULT_SETTINGS } from "../src/lib/defaults.ts";
import { CANVAS_SIZE, drawSticker } from "../src/lib/render.ts";
import type { EditorSettings, Sticker } from "../src/types.ts";

/** Maximum size of an incoming render request, measured before JSON decoding. */
const MAX_BODY_BYTES = 8 * 1024;
/** Duration of the shared render-rate counting window. */
const RATE_WINDOW_MS = 60_000;
/** Maximum time allowed for open connections to finish during shutdown. */
const SHUTDOWN_GRACE_MS = 10_000;
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

/** A registered font and its stable API-facing identity. */
interface ServiceFont {
  /** Stable identifier used in render requests. */
  id: string;
  /** Human-readable font name shared with the editor. */
  name: string;
  /** Registered native canvas font family. */
  family: string;
}

/** Validated render input resolved against the bundled catalog. */
interface RenderRequest {
  /** Catalog entry providing the local image path. */
  sticker: Sticker;
  /** Complete drawing settings shared with the browser renderer. */
  settings: EditorSettings;
}

/** An expected request failure that can be safely returned as JSON. */
class ApiError extends Error {
  /** HTTP response status. */
  readonly status: number;
  /** Stable machine-readable error identifier. */
  readonly code: string;

  /** Create an API error with a public message containing no internal details. */
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Read an integer environment setting, rejecting invalid service configuration. */
function integerSetting(
  name: string,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > maximum
  ) {
    throw new Error(
      `${name} must be a positive integer no greater than ${maximum}`,
    );
  }
  return parsed;
}

/** Register all four bundled fonts before accepting requests. */
function registerFonts(publicRoot: string): Map<string, ServiceFont> {
  const fonts = new Map<string, ServiceFont>();
  for (const [id, family] of Object.entries(FONT_FAMILIES)) {
    const definition = BUILTIN_FONTS.find((font) => font.family === family);
    if (
      !definition?.source ||
      !GlobalFonts.registerFromPath(
        resolve(publicRoot, definition.source),
        family,
      )
    ) {
      throw new Error(`Could not register bundled font: ${id}`);
    }
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
    catalog.set(sticker.id, sticker);
  }
  return catalog;
}

/** Send a JSON response with a consistent content type and no response caching. */
function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

/** Return public request errors while hiding internal exception details. */
function sendError(response: ServerResponse, cause: unknown): void {
  if (response.destroyed || response.writableEnded) return;
  if (!(cause instanceof ApiError)) {
    console.error(
      "Image API request failed:",
      cause instanceof Error ? cause : "Unexpected internal failure",
    );
  }
  const error =
    cause instanceof ApiError
      ? cause
      : new ApiError(500, "INTERNAL_ERROR", "图片服务暂时无法完成请求");
  if (error.status === 401) response.setHeader("WWW-Authenticate", "Bearer");
  if (error.status === 413) response.setHeader("Connection", "close");
  sendJson(response, error.status, {
    error: { code: error.code, message: error.message },
  });
}

/** Read a bounded JSON body without destroying the socket before a 413 response. */
function readJson(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers["content-type"]
    ?.split(";")[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    throw new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "请求类型必须为 application/json",
    );
  }
  if (Number(request.headers["content-length"] ?? 0) > MAX_BODY_BYTES) {
    throw new ApiError(413, "BODY_TOO_LARGE", "请求正文不能超过 8 KiB");
  }
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    request.on("data", (chunk: Buffer) => {
      receivedBytes += chunk.length;
      if (receivedBytes > MAX_BODY_BYTES) {
        request.pause();
        reject(new ApiError(413, "BODY_TOO_LARGE", "请求正文不能超过 8 KiB"));
        return;
      }
      chunks.push(chunk);
    });
    request.once("error", () =>
      reject(new ApiError(400, "INVALID_BODY", "无法读取请求正文")),
    );
    request.once("end", () => {
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new ApiError(400, "INVALID_JSON", "请求正文必须为有效 JSON"));
      }
    });
  });
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

/** Decode one bundled image and render a 1024-square PNG entirely in memory. */
async function renderPng(
  publicRoot: string,
  input: RenderRequest,
): Promise<Buffer> {
  const path = await realpath(catalogPath(publicRoot, input.sticker.src));
  if (!path.startsWith(`${publicRoot}${sep}`))
    throw new Error("Image path escapes the public directory");
  const image = await loadImage(path);
  const scale = 2;
  const canvas = createCanvas(CANVAS_SIZE * scale, CANVAS_SIZE * scale);
  drawSticker(
    canvas.getContext("2d"),
    image,
    image.width,
    image.height,
    input.settings,
    scale,
  );
  return canvas.encode("png");
}

/** Initialize assets and serve the authenticated image API. */
async function main(): Promise<void> {
  const apiKey = process.env.API_KEY?.trim();
  if (!apiKey)
    throw new Error("API_KEY is required to start the image service");
  const host = process.env.HOST || "127.0.0.1";
  const port = integerSetting("PORT", 8787, 65_535);
  const maxConcurrent = integerSetting("MAX_CONCURRENT_RENDERS", 2);
  const rateLimit = integerSetting("RATE_LIMIT_PER_MINUTE", 60);
  const publicRoot = await realpath(
    fileURLToPath(new URL("../public/", import.meta.url)),
  );
  const fonts = registerFonts(publicRoot);
  const catalog = await loadCatalog(publicRoot);
  const expectedAuthorization = Buffer.from(`Bearer ${apiKey}`);
  let activeRenders = 0;
  let rendersInWindow = 0;
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
    const authorization = Buffer.from(request.headers.authorization ?? "");
    if (
      authorization.length !== expectedAuthorization.length ||
      !timingSafeEqual(authorization, expectedAuthorization)
    ) {
      throw new ApiError(401, "UNAUTHORIZED", "需要有效的 Bearer API Key");
    }
    if (closing) throw new ApiError(503, "SHUTTING_DOWN", "图片服务正在关闭");
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
    if (request.method !== "POST" || path !== "/api/v1/render") {
      throw new ApiError(404, "NOT_FOUND", "接口不存在");
    }
    const input = validateRender(await readJson(request), catalog, fonts);
    const now = Date.now();
    if (now - windowStartedAt >= RATE_WINDOW_MS) {
      windowStartedAt = now;
      rendersInWindow = 0;
    }
    if (rendersInWindow >= rateLimit) {
      response.setHeader(
        "Retry-After",
        String(Math.ceil((windowStartedAt + RATE_WINDOW_MS - now) / 1000)),
      );
      throw new ApiError(429, "RATE_LIMITED", "渲染请求过于频繁，请稍后重试");
    }
    if (activeRenders >= maxConcurrent) {
      throw new ApiError(503, "RENDER_BUSY", "当前渲染任务已满，请稍后重试");
    }
    // Reserve both limits before awaiting decoding; rejected requests do not consume the render quota.
    rendersInWindow += 1;
    activeRenders += 1;
    try {
      const png = await renderPng(publicRoot, input);
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
    server.close(() => clearTimeout(timer));
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
