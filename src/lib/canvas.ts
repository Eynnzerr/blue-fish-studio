import type { EditorSettings } from "../types";

/** Logical image dimensions shared by preview and PNG export. */
export const CANVAS_SIZE = 512;

/** Keeps emoji sequences and combining marks together when spacing letters. */
const graphemes = new Intl.Segmenter("zh-CN", { granularity: "grapheme" });

/** A measured character positioned relative to the caption anchor. */
interface CaptionGlyph {
  /** Complete grapheme rendered as one unit. */
  text: string;
  /** Horizontal center in logical pixels. */
  x: number;
  /** Vertical center in logical pixels. */
  y: number;
  /** Local clockwise tangent angle in radians. */
  angle: number;
}

/** Measures and centers each line independently, including spaces. */
function positionCaption(
  context: CanvasRenderingContext2D,
  settings: EditorSettings,
): CaptionGlyph[] {
  return settings.text.split("\n").flatMap((line, lineIndex) => {
    const characters = Array.from(graphemes.segment(line), ({ segment }) => ({
      text: segment,
      width: context.measureText(segment).width,
    }));
    const width =
      characters.reduce((sum, character) => sum + character.width, 0) +
      Math.max(0, characters.length - 1) * settings.letterSpacing;
    const radius = Math.max(settings.fontSize * 3.5, width / Math.PI);
    let cursor = -width / 2;

    return characters.map((character) => {
      const center = cursor + character.width / 2;
      cursor += character.width + settings.letterSpacing;
      const angle = settings.curved ? center / radius : 0;

      // Arc length determines each glyph's angle; the center stays at the anchor.
      return {
        text: character.text,
        x: settings.curved ? radius * Math.sin(angle) : center,
        y:
          lineIndex * settings.lineHeight +
          (settings.curved ? radius * (1 - Math.cos(angle)) : 0),
        angle,
      };
    });
  });
}

/** Paints a caption pass at the precomputed character centers. */
function paintCaption(
  context: CanvasRenderingContext2D,
  glyphs: CaptionGlyph[],
  outline: boolean,
): void {
  for (const glyph of glyphs) {
    context.save();
    context.translate(glyph.x, glyph.y);
    context.rotate(glyph.angle);
    if (outline) context.strokeText(glyph.text, 0, 0);
    else context.fillText(glyph.text, 0, 0);
    context.restore();
  }
}

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

  context.scale(scale, scale);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  if (settings.background === "white") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }

  if (image) {
    const box =
      settings.layout === "caption"
        ? { x: 16, y: 124, width: 480, height: 372 }
        : { x: 0, y: 0, width: CANVAS_SIZE, height: CANVAS_SIZE };
    const ratio = Math.min(
      box.width / image.naturalWidth,
      box.height / image.naturalHeight,
    );
    const width = image.naturalWidth * ratio;
    const height = image.naturalHeight * ratio;
    context.drawImage(
      image,
      box.x + (box.width - width) / 2,
      box.y + (box.height - height) / 2,
      width,
      height,
    );
  }

  context.save();
  context.translate(settings.x, settings.y);
  context.rotate((settings.rotation * Math.PI) / 180);
  context.font = `${settings.fontSize}px ${settings.fontFamily}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.lineCap = "round";
  context.lineWidth = settings.outlineWidth;
  context.strokeStyle = settings.outlineColor;
  context.fillStyle = settings.color;

  const glyphs = positionCaption(context, settings);
  // Finish every outline before filling, so neighboring strokes cannot cover letters.
  if (settings.outlineWidth > 0) paintCaption(context, glyphs, true);
  paintCaption(context, glyphs, false);
  context.restore();
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
