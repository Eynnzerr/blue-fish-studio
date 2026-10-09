import type {
  Composition,
  EditorSettings,
  ExportFormat,
  ImageSize,
} from "../types";
import { EXPORT_FORMATS } from "./image-formats";
import { drawSticker } from "./render";

export { CANVAS_SIZE } from "./render";

/**
 * Draws the same composition for preview and export at exact output dimensions.
 */
export function renderSticker(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement | null,
  settings: EditorSettings,
  composition: Composition,
  output: ImageSize = composition,
): void {
  canvas.width = Math.max(1, Math.round(output.width));
  canvas.height = Math.max(1, Math.round(output.height));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法创建图片画布");
  context.scale(
    canvas.width / composition.width,
    canvas.height / composition.height,
  );

  drawSticker(
    context,
    image,
    image?.naturalWidth ?? 0,
    image?.naturalHeight ?? 0,
    settings,
    1,
    composition,
  );
}

/**
 * Encodes the rendered canvas in the requested format, using 92% quality for
 * JPEG and WebP. Rejects unsupported formats instead of accepting PNG fallback.
 *
 * @param canvas The fully rendered export canvas.
 * @param format The requested image encoding.
 */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: ExportFormat,
): Promise<Blob> {
  const { mimeType, label } = EXPORT_FORMATS[format];
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("图片导出失败，请重试"));
        } else if (blob.type !== mimeType) {
          reject(new Error(`当前浏览器不支持导出 ${label} 格式，请选择其他格式`));
        } else {
          resolve(blob);
        }
      },
      mimeType,
      format === "png" ? undefined : 0.92,
    );
  });
}
