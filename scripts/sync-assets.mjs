import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, extname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute project directory, independent of the caller's working directory. */
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
/** Archive checkout supplied on the command line, or the adjacent repository. */
const sourceRoot = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(projectRoot, "../blue-fish-archive");
/** Public directory containing the self-contained image library. */
const publicRoot = resolve(projectRoot, "public");
/** Raster formats supported by the upstream archive; active document formats are excluded. */
const allowedImageExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".apng",
]);

/** Curated images in gallery order; the waving portrait is the initial canvas. */
const featuredImages = [
  [
    "d862eb062421f65d869091609b86f520.png",
    "挥手打招呼",
    ["挥手", "你好", "开心", "透明底"],
  ],
  [
    "c0b02b5d709e92585afa2d6167f411e6.png",
    "乖巧看你",
    ["乖巧", "可爱", "透明底"],
  ],
  [
    "669a40f46758917ffbbf43c961b484c3.png",
    "眼镜认真鱼",
    ["眼镜", "认真", "思考", "透明底"],
  ],
  [
    "3734d055a7ed7624e3f0951a3a6941a5.png",
    "开开心心",
    ["开心", "笑脸", "透明底"],
  ],
  [
    "2debd765-ea55-41a9-a383-7d39826bee2d.png",
    "摸摸头",
    ["摸头", "开心", "可爱"],
  ],
  [
    "89128212ab62c6eb4e03a95568bf9827.png",
    "吃瓜时间",
    ["吃瓜", "围观", "西瓜"],
  ],
  [
    "76800d7e469366970d8983bea4b22ed0.jpg",
    "满脑子问号",
    ["疑问", "问号", "思考"],
  ],
  [
    "ce08b4d81dbd0858a3e364ae068fadaf.jpg",
    "开心干饭",
    ["干饭", "吃饭", "开心"],
  ],
  [
    "f403ac42d0b8c2d0d771745f3d9c6163_0.png",
    "鲸鱼窝里睡觉",
    ["睡觉", "困困", "休息"],
  ],
  ["image007.png", "简笔小鱼", ["简笔画", "可爱", "乖巧"]],
];

/** Editorial data keyed by the archive's stable original filename. */
const featuredByFilename = new Map(
  featuredImages.map(([filename, name, tags], order) => [
    filename,
    { name, tags, order },
  ]),
);

/**
 * Identify an original image from its file signature, independently of its filename.
 * @param {Buffer} bytes Original image bytes.
 * @returns {"PNG" | "JPEG" | "GIF" | "WebP"} Display label for the detected encoding.
 */
function detectOriginalFormat(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "PNG";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "JPEG";
  if (["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))) return "GIF";
  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    return "WebP";
  throw new Error("Unsupported original image format");
}

/** Copy one image only when its manifest path and resolved source stay in the allowed directory. */
async function copyArchiveAsset(
  relativePath,
  directory,
  resolvedSourceRoot,
  stagingRoot,
) {
  if (
    typeof relativePath !== "string" ||
    isAbsolute(relativePath) ||
    !relativePath.startsWith(`${directory}/`) ||
    relativePath.includes("\\") ||
    relativePath.split("/").includes("..") ||
    !allowedImageExtensions.has(extname(relativePath).toLowerCase())
  ) {
    throw new Error(`Invalid ${directory} asset path: ${relativePath}`);
  }

  /** Canonical image path, including the targets of any source symlinks. */
  const source = await realpath(resolve(resolvedSourceRoot, relativePath));
  /** Expected source boundary; a directory symlink cannot redirect this outside the checkout. */
  const sourceDirectory = resolve(resolvedSourceRoot, directory);
  if (!source.startsWith(`${sourceDirectory}${sep}`)) {
    throw new Error(`Asset escapes ${directory}: ${relativePath}`);
  }

  /** Destination inside the fresh staging directory, using the validated manifest path. */
  const destination = resolve(stagingRoot, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

/** Refresh archive images and metadata without changing the separate studio collection. */
async function syncAssets() {
  /** Canonical checkout root used to validate every source image. */
  const resolvedSourceRoot = await realpath(sourceRoot);
  /** Upstream entries in their original order. */
  const manifest = JSON.parse(
    await readFile(
      resolve(resolvedSourceRoot, "stickers/manifest.json"),
      "utf8",
    ),
  );

  await mkdir(publicRoot, { recursive: true });
  /** Temporary archive on the same filesystem as its final destination. */
  const stagingRoot = await mkdtemp(resolve(publicRoot, ".archive-sync-"));
  try {
    /** Generated gallery metadata, preserving the existing labels and sort order. */
    const stickers = [];
    for (const [index, entry] of manifest.entries()) {
      /** Optional curated name and tags for this original archive filename. */
      const editorial = featuredByFilename.get(entry.filename);
      // Sequential copies finish or fail before cleanup can remove the staging directory.
      await copyArchiveAsset(
        entry.original,
        "media",
        resolvedSourceRoot,
        stagingRoot,
      );
      await copyArchiveAsset(
        entry.preview,
        "previews",
        resolvedSourceRoot,
        stagingRoot,
      );
      /** Encoding detected from the copied original, since upstream extensions can be inaccurate. */
      const format = detectOriginalFormat(
        await readFile(resolve(stagingRoot, entry.original)),
      );

      stickers.push({
        id: entry.filename,
        /** Gallery source; creator attribution remains in the archive metadata. */
        origin: "archive",
        name:
          editorial?.name ?? `大肥鱼 #${String(index + 1).padStart(3, "0")}`,
        src: `archive/${entry.original}`,
        /** Original encoding shown in the gallery and canvas details. */
        format,
        preview: `archive/${entry.preview}`,
        tags: ["大肥鱼", "鲸鱼娘", "DeepSeek", ...(editorial?.tags ?? [])],
        featured: Boolean(editorial),
        selfMade: Boolean(entry.selfMade),
        animated: format === "GIF",
        // Archive metadata describes the thumbnail; its aspect ratio matches the original.
        width: entry.width,
        height: entry.height,
      });
    }

    stickers.sort(
      (left, right) =>
        (featuredByFilename.get(left.id)?.order ?? featuredImages.length) -
        (featuredByFilename.get(right.id)?.order ?? featuredImages.length),
    );
    // Replace only after every image is present; removed upstream entries disappear with the old archive.
    await rm(resolve(publicRoot, "archive"), { recursive: true, force: true });
    await rename(stagingRoot, resolve(publicRoot, "archive"));
    await writeFile(
      resolve(publicRoot, "stickers.json"),
      `${JSON.stringify(stickers, null, 2)}\n`,
    );
    console.log(
      `Imported ${stickers.length} images and previews from ${sourceRoot}`,
    );
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

await syncAssets();
