import type { IncomingMessage, ServerResponse } from "node:http";

/** Maximum accepted JSON body size for API requests. */
const MAX_BODY_BYTES = 8 * 1024;

/** An expected request failure that can be safely returned as JSON. */
export class ApiError extends Error {
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
export function integerSetting(
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

/** Send a JSON response with a consistent content type and no response caching. */
export function sendJson(
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
export function sendError(response: ServerResponse, cause: unknown): void {
  if (response.destroyed || response.writableEnded) return;
  if (!(cause instanceof ApiError)) {
    console.error(
      "API request failed:",
      cause instanceof Error ? cause : "Unexpected internal failure",
    );
  }
  const error =
    cause instanceof ApiError
      ? cause
      : new ApiError(500, "INTERNAL_ERROR", "服务暂时无法完成请求");
  if (error.status === 401) response.setHeader("WWW-Authenticate", "Bearer");
  if (error.status === 413) response.setHeader("Connection", "close");
  sendJson(response, error.status, {
    error: { code: error.code, message: error.message },
  });
}

/** Read a bounded JSON body without destroying the socket before a 413 response. */
export function readJson(request: IncomingMessage): Promise<unknown> {
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

