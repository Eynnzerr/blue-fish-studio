import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute project directory, independent of the caller's working directory. */
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
/** Archive checkout supplied on the command line, or the adjacent repository. */
const sourceRoot = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(projectRoot, "../blue-fish-archive");
/** Public directory containing the self-contained image library. */
const publicRoot = resolve(projectRoot, "public");

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

/** Copy an archive asset while preserving its original subdirectory and bytes. */
async function copyArchiveAsset(relativePath) {
  const destination = resolve(publicRoot, "archive", relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(resolve(sourceRoot, relativePath), destination);
}

/** Refresh archive images and metadata without changing the separate studio collection. */
async function syncAssets() {
  const manifest = JSON.parse(
    await readFile(resolve(sourceRoot, "stickers/manifest.json"), "utf8"),
  );
  const stickers = await Promise.all(
    manifest.map(async (entry, index) => {
      const editorial = featuredByFilename.get(entry.filename);
      await Promise.all([
        copyArchiveAsset(entry.original),
        copyArchiveAsset(entry.preview),
      ]);

      return {
        id: entry.filename,
        /** Gallery source; creator attribution remains in the archive metadata. */
        origin: "archive",
        name:
          editorial?.name ?? `大肥鱼 #${String(index + 1).padStart(3, "0")}`,
        src: `archive/${entry.original}`,
        preview: `archive/${entry.preview}`,
        tags: ["大肥鱼", "鲸鱼娘", "DeepSeek", ...(editorial?.tags ?? [])],
        featured: Boolean(editorial),
        selfMade: Boolean(entry.selfMade),
        animated: entry.filename.toLowerCase().endsWith(".gif"),
        // Archive metadata describes the thumbnail; its aspect ratio matches the original.
        width: entry.width,
        height: entry.height,
      };
    }),
  );

  stickers.sort(
    (left, right) =>
      (featuredByFilename.get(left.id)?.order ?? featuredImages.length) -
      (featuredByFilename.get(right.id)?.order ?? featuredImages.length),
  );
  await writeFile(
    resolve(publicRoot, "stickers.json"),
    `${JSON.stringify(stickers, null, 2)}\n`,
  );
  console.log(
    `Imported ${stickers.length} images and previews from ${sourceRoot}`,
  );
}

await syncAssets();
