/** One archive, workshop, or personal image with its provenance and labels. */
export interface Sticker {
  /** Stable bundled-image identifier or a session identifier for a personal image. */
  id: string;
  /** Human-readable gallery label. */
  name: string;
  /** Collection that supplies the image, including generated and uploaded session images. */
  origin: "archive" | "studio" | "upload" | "generated";
  /** Original archive image identifier when this image is a workshop derivative. */
  sourceId?: string;
  /** Archive images used as character references for a newly drawn composition. */
  referenceIds?: string[];
  /** Human-readable source details for the selected image. */
  sourceNote?: string;
  /** Full-resolution image URL. */
  src: string;
  /** Original image format, identified before thumbnail or editing conversions. */
  format: string;
  /** Lightweight gallery thumbnail URL. */
  preview: string;
  /** Searchable labels assigned to curated images. */
  tags: string[];
  /** Whether this image is in the curated gallery. */
  featured: boolean;
  /** Whether the archive marks this image as made by its maintainer. */
  selfMade: boolean;
  /** Whether the original image contains animation. */
  animated: boolean;
  /** Preview metadata width; drawing uses the decoded image's natural width. */
  width: number;
  /** Preview metadata height; drawing uses the decoded image's natural height. */
  height: number;
}

/** Static formats available for browser downloads. */
export type ExportFormat = "png" | "jpeg" | "webp";

/** Image or canvas dimensions, in source, logical, or output pixels. */
export interface ImageSize {
  /** Horizontal extent. */
  width: number;
  /** Vertical extent. */
  height: number;
}

/** Source-image selection expressed as percentages of the original image. */
export interface ImageCrop {
  /** Left edge as a percentage of the original width. */
  x: number;
  /** Top edge as a percentage of the original height. */
  y: number;
  /** Selected width as a percentage of the original width. */
  width: number;
  /** Selected height as a percentage of the original height. */
  height: number;
}

/** Logical canvas geometry and the non-destructive source selection. */
export interface Composition extends ImageSize {
  /** Percentage selection; null draws the entire original image. */
  crop: ImageCrop | null;
}

/** Public cumulative counters for website visits and completed exports. */
export interface SiteStats {
  /** Number of reported page loads, including refreshes. */
  visits: number;
  /** Number of completed download or clipboard export actions. */
  exports: number;
  /** ISO timestamp when this database started collecting events. */
  startedAt: string;
}

/** Browser actions counted by the public statistics endpoint. */
export type StatsEventKind = "page_view" | "export";

/** Serializable typography with a 512-unit relative position on each axis. */
export interface EditorSettings {
  /** Caption; newline characters create separate lines. */
  text: string;
  /** Caption center: 0 is the left edge and 512 is the right edge. */
  x: number;
  /** First line center: 0 is the top edge and 512 is the bottom edge. */
  y: number;
  /** Font size in logical pixels. */
  fontSize: number;
  /** Registered FontFace family or system font stack. */
  fontFamily: string;
  /** Caption fill color. */
  color: string;
  /** Outline color. */
  outlineColor: string;
  /** Outline width in logical pixels. */
  outlineWidth: number;
  /** Clockwise caption rotation in degrees. */
  rotation: number;
  /** Distance between line centers in logical pixels. */
  lineHeight: number;
  /** Additional spacing between graphemes in logical pixels. */
  letterSpacing: number;
  /** Render each line along an upward arc. */
  curved: boolean;
  /** Preferred background; PNG and WebP support transparency, while JPEG uses white. */
  background: "transparent" | "white";
  /** Reserve a caption band, or overlay text on the full image. */
  layout: "caption" | "overlay";
}

/** Font available in the current browser session. */
export interface FontOption {
  /** CSS family registered with the browser. */
  family: string;
  /** User-visible name. */
  label: string;
  /** Bundled font path, loaded on selection; absent for system and uploaded fonts. */
  source?: string;
}
