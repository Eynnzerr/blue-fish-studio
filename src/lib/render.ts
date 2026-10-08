import type { EditorSettings } from "../types";

/** Logical image dimensions shared by preview, browser export, and server rendering. */
export const CANVAS_SIZE = 512;

/** Canvas operations shared by browser and native drawing contexts. */
export interface StickerDrawingContext<TImage> {
  /** Enable interpolation when scaling source artwork. */
  imageSmoothingEnabled: boolean;
  /** Select the interpolation quality for scaled artwork. */
  imageSmoothingQuality: "low" | "medium" | "high";
  /** Current fill paint; rendering assigns CSS color strings. */
  fillStyle: string | object;
  /** Current stroke paint; rendering assigns CSS color strings. */
  strokeStyle: string | object;
  /** CSS font shorthand used for caption measurement and drawing. */
  font: string;
  /** Horizontal text anchoring relative to its drawing position. */
  textAlign: "left" | "right" | "center" | "start" | "end";
  /** Vertical text anchoring relative to its drawing position. */
  textBaseline:
    "top" | "hanging" | "middle" | "alphabetic" | "ideographic" | "bottom";
  /** Shape used where outline segments meet. */
  lineJoin: "round" | "bevel" | "miter";
  /** Shape used at outline endpoints. */
  lineCap: "butt" | "round" | "square";
  /** Outline width in logical canvas pixels. */
  lineWidth: number;
  /** Push the current drawing state onto the context stack. */
  save(): void;
  /** Restore the last saved drawing state. */
  restore(): void;
  /** Scale logical coordinates along both axes. */
  scale(x: number, y: number): void;
  /** Move the drawing origin in logical coordinates. */
  translate(x: number, y: number): void;
  /** Rotate subsequent drawing operations clockwise in radians. */
  rotate(angle: number): void;
  /** Paint a rectangle using the current fill style. */
  fillRect(x: number, y: number, width: number, height: number): void;
  /** Fit source artwork into the supplied destination rectangle. */
  drawImage(
    image: TImage,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void;
  /** Measure a grapheme using the current font. */
  measureText(text: string): {
    /** Horizontal advance in logical pixels. */
    width: number;
  };
  /** Paint the outline of a grapheme at the supplied text anchor. */
  strokeText(text: string, x: number, y: number): void;
  /** Paint the interior of a grapheme at the supplied text anchor. */
  fillText(text: string, x: number, y: number): void;
}

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
function positionCaption<TImage>(
  context: StickerDrawingContext<TImage>,
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
function paintCaption<TImage>(
  context: StickerDrawingContext<TImage>,
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
 * Draws a sticker onto a fresh context sized to `CANVAS_SIZE * scale` on each axis.
 * @param context Browser or native canvas context with its initial transform.
 * @param image Decoded artwork, or null to render only the caption and background.
 * @param imageWidth Natural source-image width; unused when image is null.
 * @param imageHeight Natural source-image height; unused when image is null.
 * @param settings Caption and layout values in 512 × 512 logical coordinates.
 * @param scale Output-resolution multiplier that preserves logical placement.
 */
export function drawSticker<TImage>(
  context: StickerDrawingContext<TImage>,
  image: TImage | null,
  imageWidth: number,
  imageHeight: number,
  settings: EditorSettings,
  scale = 1,
): void {
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
    const ratio = Math.min(box.width / imageWidth, box.height / imageHeight);
    const width = imageWidth * ratio;
    const height = imageHeight * ratio;
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
