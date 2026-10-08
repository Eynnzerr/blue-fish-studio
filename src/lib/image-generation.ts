/** Settings for one request to an OpenAI-compatible image generation endpoint. */
export interface ImageGenerationOptions {
  /** HTTPS API base URL or complete images/generations endpoint. */
  baseUrl: string;
  /** Model identifier accepted by the selected provider. */
  model: string;
  /** User-supplied bearer token, used only for the generation request. */
  apiKey: string;
  /** Description of the image to generate. */
  prompt: string;
  /** Provider-supported image size; an empty value omits the parameter. */
  size: string;
  /** Request a transparent PNG from providers supporting these parameters. */
  transparent: boolean;
}

/** Resolve the image endpoint while preserving provider-specific API prefixes. */
export function resolveImageEndpoint(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new Error("请输入有效的 API Base URL");
  }

  const localHosts = ["localhost", "127.0.0.1", "[::1]"];
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && localHosts.includes(url.hostname))
  ) {
    throw new Error(
      "API 地址必须使用 HTTPS；本机 localhost、127.0.0.1 或 [::1] 可使用 HTTP",
    );
  }
  if (url.username || url.password || /[?#]/.test(baseUrl)) {
    throw new Error("API 地址不能包含用户名、密码、查询参数或片段");
  }

  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith("/images/generations")
    ? path
    : `${path}/images/generations`;
  return url.toString();
}

/** Narrow an API response object without accepting null or arrays. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Remove the supplied token from any error text returned to the interface. */
function redactApiKey(message: string, apiKey: string): string {
  return apiKey ? message.split(apiKey).join("[已隐藏 API Key]") : message;
}

/** Identify the returned image from its bytes instead of trusting an HTTP MIME type. */
async function identifyImage(blob: Blob): Promise<Blob> {
  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  let type: string;
  if (
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (byte, index) => header[index] === byte,
    )
  ) {
    type = "image/png";
  } else if (header[0] === 255 && header[1] === 216 && header[2] === 255) {
    type = "image/jpeg";
  } else if (
    String.fromCharCode(...header.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...header.slice(8, 12)) === "WEBP"
  ) {
    type = "image/webp";
  } else {
    throw new Error("生成接口返回的图片格式无法识别，请使用 PNG、JPEG 或 WebP");
  }
  return new Blob([blob], { type });
}

/** Download a generated image without forwarding the API token or browser credentials. */
async function downloadImage(url: string, signal?: AbortSignal): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: "omit", signal });
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw cause;
    throw new Error(
      "图片已生成，但下载失败，请检查网络或图片地址的跨域（CORS）设置",
    );
  }
  if (!response.ok)
    throw new Error(`图片已生成，但下载失败（HTTP ${response.status}）`);
  return identifyImage(await response.blob());
}

/** Generate one image and return a locally usable PNG, JPEG, or WebP Blob. */
export async function generateImage(
  options: ImageGenerationOptions,
  signal?: AbortSignal,
): Promise<Blob> {
  const apiKey = options.apiKey.trim();
  try {
    const endpoint = resolveImageEndpoint(options.baseUrl);
    const body = {
      model: options.model.trim(),
      prompt: options.prompt,
      n: 1,
      ...(options.size.trim() ? { size: options.size.trim() } : {}),
      ...(options.transparent
        ? { background: "transparent", output_format: "png" }
        : {}),
    };
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        credentials: "omit",
        // Refuse redirects so the supplied bearer token stays at the chosen endpoint.
        redirect: "error",
        signal,
      });
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") throw cause;
      throw new Error(
        "无法连接图片生成接口，请检查地址、网络及跨域（CORS）设置；接口地址应直接返回响应",
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") throw cause;
      throw new Error(
        response.ok
          ? "生成接口返回了无法解析的 JSON"
          : `图片生成失败（HTTP ${response.status}）`,
      );
    }
    if (!response.ok) {
      const detail =
        isRecord(payload) &&
        isRecord(payload.error) &&
        typeof payload.error.message === "string"
          ? `：${payload.error.message}`
          : "";
      throw new Error(`图片生成失败（HTTP ${response.status}）${detail}`);
    }
    const first =
      isRecord(payload) && Array.isArray(payload.data) ? payload.data[0] : null;
    if (!isRecord(first))
      throw new Error("生成接口未返回图片，请检查模型与接口配置");

    if (typeof first.b64_json === "string" && first.b64_json) {
      let bytes: Uint8Array<ArrayBuffer>;
      try {
        bytes = Uint8Array.from(atob(first.b64_json), (character) =>
          character.charCodeAt(0),
        );
      } catch {
        throw new Error("生成接口返回了无效的图片编码");
      }
      return await identifyImage(new Blob([bytes]));
    }
    if (typeof first.url === "string" && first.url) {
      return await downloadImage(first.url, signal);
    }
    throw new Error("生成结果缺少 data[0].b64_json 或 data[0].url");
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw cause;
    const message =
      cause instanceof Error ? cause.message : "图片生成失败，请重试";
    throw new Error(redactApiKey(message, apiKey));
  }
}
