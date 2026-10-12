import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Human-edited fields tied to the original image bytes.
 * @typedef {object} ManualLabels
 * @property {string} sha256 SHA-256 fingerprint of the reviewed original image.
 * @property {string} [name] Human-readable name overriding the generated name.
 * @property {string[]} [tags] Search labels overriding all generated labels.
 * @property {string} [ocrText] Transcribed image text overriding generated OCR.
 */

/**
 * Structured model output tied to an original image and labeling prompt.
 * @typedef {object} AutomaticLabels
 * @property {string} sha256 SHA-256 fingerprint of the labeled original image.
 * @property {string} name Generated human-readable gallery name.
 * @property {string[]} emotions Emotion labels selected from the fixed vocabulary.
 * @property {string[]} scenes Conversation scenarios selected from the fixed vocabulary.
 * @property {string[]} actions Visible actions selected from the fixed vocabulary.
 * @property {string} ocrText Text transcribed from the image.
 * @property {boolean} needsReview Whether the model or a reviewer marked this candidate for review.
 * @property {string} model Model identifier used for this result.
 * @property {number} promptVersion Version of the labeling prompt and vocabulary.
 */

/**
 * Persistent annotations for one archive filename, retained when upstream removes it.
 * @typedef {object} LabelRecord
 * @property {ManualLabels} [manual] Human annotations preserved by automated runs.
 * @property {AutomaticLabels} [automatic] Most recent successful model annotations.
 * @property {string} [error] Most recent labeling failure, pending a later retry.
 * @property {number} [lastAttemptAt] Last request time used to rotate failed-item retries.
 */

/**
 * Current labels ready to merge into a public gallery entry.
 * @typedef {object} ImageLabels
 * @property {string} [name] Current human or generated name, when available.
 * @property {string[]} tags Distinct current labels with manual values taking precedence.
 * @property {string} ocrText Current transcription, or an empty string.
 */

/** Project root used by both local commands and GitHub Actions. */
const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
/** Persistent annotations are kept outside the generated public gallery. */
const labelsPath = resolve(projectRoot, "metadata/sticker-labels.json");
/** Generic labels shared by every imported archive image. */
const baseTags = ["大肥鱼", "鲸鱼娘", "DeepSeek"];

/**
 * Read saved annotations, allowing an empty first run only when the file is absent.
 * @returns {Promise<Record<string, LabelRecord>>} Records keyed by archive filename.
 */
export async function readLabels() {
  try {
    return JSON.parse(await readFile(labelsPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

/**
 * Atomically replace annotations with a stable filename order, retaining every record.
 * @param {Record<string, LabelRecord>} records Complete annotation records to persist.
 * @returns {Promise<void>}
 */
export async function writeLabels(records) {
  const sorted = Object.fromEntries(
    Object.entries(records).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );
  const temporaryPath = `${labelsPath}.${process.pid}.tmp`;
  await mkdir(dirname(labelsPath), { recursive: true });
  try {
    await writeFile(temporaryPath, `${JSON.stringify(sorted, null, 2)}\n`);
    await rename(temporaryPath, labelsPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

/**
 * Fingerprint original image bytes independently of filenames and preview encodings.
 * @param {Uint8Array} bytes Bytes of the original archive image.
 * @returns {string} Lowercase hexadecimal SHA-256 digest.
 */
export function hashImage(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Merge annotations for these exact bytes, excluding unreviewed automatic candidates.
 * Human-edited fields take precedence over usable automatic annotations.
 * @param {LabelRecord | undefined} record Saved annotations for the archive filename.
 * @param {string} sha256 Fingerprint of the current original image.
 * @returns {ImageLabels} Labels suitable for rebuilding the public gallery entry.
 */
export function getImageLabels(record, sha256) {
  const manual = record?.manual?.sha256 === sha256 ? record.manual : undefined;
  const automatic =
    record?.automatic?.sha256 === sha256 && !record.automatic.needsReview
      ? record.automatic
      : undefined;
  const name = manual?.name ?? automatic?.name;
  const tags = manual?.tags ?? [
    ...(automatic?.emotions ?? []),
    ...(automatic?.scenes ?? []),
    ...(automatic?.actions ?? []),
  ];
  return {
    ...(name === undefined ? {} : { name }),
    tags: [...new Set(tags)],
    ocrText: manual?.ocrText ?? automatic?.ocrText ?? "",
  };
}

/**
 * Rebuild archive names, tags and OCR after labeling without recopying image files.
 * @param {Record<string, LabelRecord>} labels Complete persistent annotation records.
 * @returns {Promise<void>}
 */
export async function applyLabelsToGallery(labels) {
  const publicRoot = resolve(projectRoot, "public");
  const galleryPath = resolve(publicRoot, "stickers.json");
  const gallery = JSON.parse(await readFile(galleryPath, "utf8"));
  // The upstream manifest sorts original filenames case-insensitively before numbering.
  const originalOrder = gallery
    .filter((item) => item.origin === "archive")
    .map((item) => item.id)
    .sort((left, right) => {
      const first = left.toLowerCase();
      const second = right.toLowerCase();
      return first < second ? -1 : first > second ? 1 : 0;
    });
  const defaultNames = new Map(
    originalOrder.map((id, index) => [
      id,
      `大肥鱼 #${String(index + 1).padStart(3, "0")}`,
    ]),
  );
  for (const item of gallery) {
    if (item.origin !== "archive") continue;
    const sha256 = hashImage(await readFile(resolve(publicRoot, item.src)));
    const current = getImageLabels(labels[item.id], sha256);
    item.name = current.name ?? defaultNames.get(item.id);
    item.tags = [...new Set([...baseTags, ...current.tags])];
    // Rebuild from annotation records so replaced or withdrawn labels never accumulate.
    delete item.ocrText;
    if (current.ocrText) item.ocrText = current.ocrText;
  }
  await writeFile(galleryPath, `${JSON.stringify(gallery, null, 2)}\n`);
}
