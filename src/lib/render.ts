import type { Composition, EditorSettings, ImageSize } from "../types";

/** Logical image dimensions shared by preview, browser export, and server rendering. */
export const CANVAS_SIZE = 512;

/** Default square geometry also used by the HTTP renderer. */
export const DEFAULT_COMPOSITION: Composition = {
  width: CANVAS_SIZE,
  height: CANVAS_SIZE,
  crop: null,
};

/** Fit an aspect ratio to a requested integer longest edge. */
export function sizeFromLongestEdge(
  aspect: number,
  longestEdge: number,
): ImageSize {
  return {
    width: Math.max(
      1,
      Math.round(aspect >= 1 ? longestEdge : longestEdge * aspect),
    ),
    height: Math.max(
      1,
      Math.round(aspect >= 1 ? longestEdge / aspect : longestEdge),
    ),
  };
}

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
    | "top"
    | "hanging"
    | "middle"
    | "alphabetic"
    | "ideographic"
    | "bottom";
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
  /** Draw a source selection into the supplied destination rectangle. */
  drawImage(
    image: TImage,
    sourceX: number,
    sourceY: number,
    sourceWidth: number,
    sourceHeight: number,
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
 * Draws the selected source region and editable caption onto a fresh canvas.
 * @param context Browser or native canvas context with its initial transform.
 * @param image Decoded artwork, or null to render only the caption and background.
 * @param imageWidth Natural source-image width; unused when image is null.
 * @param imageHeight Natural source-image height; unused when image is null.
 * @param settings Typography and relative caption positions on 512-unit axes.
 * @param scale Output-resolution multiplier that preserves logical placement.
 * @param composition Logical dimensions and percentage source selection.
 */
export function drawSticker<TImage>(
  context: StickerDrawingContext<TImage>,
  image: TImage | null,
  imageWidth: number,
  imageHeight: number,
  settings: EditorSettings,
  scale = 1,
  composition: Composition = DEFAULT_COMPOSITION,
): void {
  const { width: canvasWidth, height: canvasHeight, crop } = composition;
  context.scale(scale, scale);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  if (settings.background === "white") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  if (image) {
    const box =
      settings.layout === "caption"
        ? {
            x: canvasWidth * (16 / CANVAS_SIZE),
            y: canvasHeight * (124 / CANVAS_SIZE),
            width: canvasWidth * (480 / CANVAS_SIZE),
            height: canvasHeight * (372 / CANVAS_SIZE),
          }
        : { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
    const sourceX = (imageWidth * (crop?.x ?? 0)) / 100;
    const sourceY = (imageHeight * (crop?.y ?? 0)) / 100;
    const sourceWidth = (imageWidth * (crop?.width ?? 100)) / 100;
    const sourceHeight = (imageHeight * (crop?.height ?? 100)) / 100;
    const ratio = Math.min(box.width / sourceWidth, box.height / sourceHeight);
    const width = sourceWidth * ratio;
    const height = sourceHeight * ratio;
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      box.x + (box.width - width) / 2,
      box.y + (box.height - height) / 2,
      width,
      height,
    );
  }

  context.save();
  // Each position axis spans the full canvas, preserving placement when its ratio changes.
  context.translate(
    (settings.x / CANVAS_SIZE) * canvasWidth,
    (settings.y / CANVAS_SIZE) * canvasHeight,
  );
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
