import type { ExportFormat } from "../types";

/** User-facing name and encoding details for a downloadable image. */
interface ExportFormatDetails {
  /** Display name used in the controls and download button. */
  label: string;
  /** Browser canvas encoding MIME type. */
  mimeType: string;
  /** Filename suffix, without a leading dot. */
  extension: string;
}

/** Shared encoding metadata for the browser export controls. */
export const EXPORT_FORMATS: Record<ExportFormat, ExportFormatDetails> = {
  png: { label: "PNG", mimeType: "image/png", extension: "png" },
  jpeg: { label: "JPEG", mimeType: "image/jpeg", extension: "jpg" },
  webp: { label: "WebP", mimeType: "image/webp", extension: "webp" },
};

/** Identify common raster formats from file bytes, including images with misleading extensions. */
export async function readImageFormat(blob: Blob): Promise<string> {
  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (byte, index) => header[index] === byte,
    )
  )
    return "PNG";
  if (header[0] === 255 && header[1] === 216 && header[2] === 255)
    return "JPEG";
  const signature = String.fromCharCode(...header);
  if (signature.startsWith("GIF87a") || signature.startsWith("GIF89a"))
    return "GIF";
  if (signature.startsWith("RIFF") && signature.slice(8) === "WEBP")
    return "WebP";
  return blob.type.startsWith("image/")
    ? blob.type.slice(6).replace(/\+xml$/, "").toUpperCase()
    : "图片";
}
