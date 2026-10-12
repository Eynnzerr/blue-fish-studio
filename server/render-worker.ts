import { resolve } from "node:path";
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { BUILTIN_FONTS } from "../src/lib/defaults.ts";
import { CANVAS_SIZE, drawSticker } from "../src/lib/render.ts";
import type { EditorSettings, Sticker } from "../src/types.ts";
import {
  renderCatalogPreview,
  type CatalogPreviewItem,
} from "./catalog-preview.ts";

/** A single render request whose catalog paths have been validated by the HTTP process. */
export type RenderJob =
  | {
      /** Produce one sticker with the supplied caption settings. */
      kind: "render";
      /** Absolute directory containing the bundled fonts and image assets. */
      publicRoot: string;
      /** Validated absolute path to the original sticker image. */
      imagePath: string;
      /** Complete drawing settings shared with the browser editor. */
      settings: EditorSettings;
    }
  | {
      /** Produce a numbered sheet for the requested catalog entries. */
      kind: "preview";
      /** Absolute directory containing the bundled fonts and image assets. */
      publicRoot: string;
      /** Ordered catalog entries and their validated local thumbnail paths. */
      items: Array<{
        /** Catalog metadata displayed beneath the thumbnail. */
        sticker: Sticker;
        /** Validated absolute path to the catalog thumbnail. */
        imagePath: string;
      }>;
    };

/** Register the bundled font files for this process's single rendering job. */
function registerFonts(publicRoot: string): void {
  for (const font of BUILTIN_FONTS) {
    if (
      font.source &&
      !GlobalFonts.registerFromPath(resolve(publicRoot, font.source), font.family)
    ) {
      throw new Error("Unable to load bundled fonts.");
    }
  }
}

/** Decode one trusted JSON job written to stdin by the HTTP process. */
async function readJob(): Promise<RenderJob> {
  process.stdin.setEncoding("utf8");
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return JSON.parse(input) as RenderJob;
}

/** Encode the same square sticker composition served by the HTTP render endpoint. */
async function renderStickerPng(
  job: Extract<RenderJob, { kind: "render" }>,
): Promise<Buffer> {
  const image = await loadImage(job.imagePath);
  const scale = 2;
  const canvas = createCanvas(CANVAS_SIZE * scale, CANVAS_SIZE * scale);
  try {
    drawSticker(
      canvas.getContext("2d"),
      image,
      image.width,
      image.height,
      job.settings,
      scale,
    );
    return canvas.encodeSync("png");
  } finally {
    // Release the drawing surface before discarding the decoded source image.
    canvas.width = 1;
    canvas.height = 1;
    image.src = "";
  }
}

/** Decode the requested thumbnails and encode their numbered catalog sheet. */
async function renderPreviewPng(
  job: Extract<RenderJob, { kind: "preview" }>,
): Promise<Buffer> {
  const items: CatalogPreviewItem[] = [];
  try {
    for (const item of job.items) {
      items.push({
        sticker: item.sticker,
        image: await loadImage(item.imagePath),
      });
    }
    return await renderCatalogPreview(items);
  } finally {
    for (const item of items) item.image.src = "";
  }
}

/** Write one PNG to stdout, then exit so the OS releases all native rendering memory. */
async function main(): Promise<void> {
  const job = await readJob();
  registerFonts(job.publicRoot);
  const png =
    job.kind === "render"
      ? await renderStickerPng(job)
      : await renderPreviewPng(job);
  await new Promise<void>((resolveWrite, rejectWrite) => {
    process.stdout.write(png, (error) => {
      if (error) rejectWrite(error);
      else resolveWrite();
    });
  });
  process.exit(0);
}

main().catch((cause: unknown) => {
  const message = cause instanceof Error ? cause.message : "Image rendering failed.";
  process.stderr.write(`${message}\n`, () => process.exit(1));
});
