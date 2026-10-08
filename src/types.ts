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

/** Serializable drawing settings measured in a 512 × 512 logical canvas. */
export interface EditorSettings {
  /** Caption; newline characters create separate lines. */
  text: string;
  /** Caption center on the horizontal axis. */
  x: number;
  /** Vertical center of the first caption line. */
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
  /** Export background. Transparency is preserved in PNG output. */
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
}
