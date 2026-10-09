import type { Composition, EditorSettings, ImageSize } from "../types";
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

/** Encodes the rendered canvas as a PNG while preserving its alpha channel. */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("图片导出失败，请重试"));
    }, "image/png");
  });
}
