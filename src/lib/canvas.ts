import type { EditorSettings } from "../types";
import { CANVAS_SIZE, drawSticker } from "./render";

export { CANVAS_SIZE } from "./render";

/**
 * Draws the same 512 × 512 composition for preview and export.
 * `scale` increases PNG resolution while preserving all logical coordinates.
 */
export function renderSticker(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement | null,
  settings: EditorSettings,
  scale = 1,
): void {
  canvas.width = CANVAS_SIZE * scale;
  canvas.height = CANVAS_SIZE * scale;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法创建图片画布");

  drawSticker(
    context,
    image,
    image?.naturalWidth ?? 0,
    image?.naturalHeight ?? 0,
    settings,
    scale,
  );
}

/** Encodes the rendered canvas as a PNG while preserving its alpha channel. */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("图片导出失败，请重试"));
    }, "image/png");
  });
}
