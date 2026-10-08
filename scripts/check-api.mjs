import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";

/** Running HTTP service under verification; shared by native and container checks. */
const baseUrl = process.env.API_BASE_URL || "http://127.0.0.1:8787";
/** Private service credential supplied through the environment, never written to reports. */
const apiKey = process.env.API_KEY;
if (!apiKey) throw new Error("Set API_KEY before running the API smoke check.");
/** Generated PNGs and a compact report remain outside version control. */
const outputDirectory = resolve(
  process.env.API_SMOKE_OUTPUT || ".preview/api-smoke",
);
/** Authentication used only for this service's API requests. */
const authorization = { Authorization: `Bearer ${apiKey}` };
/** Observable HTTP and image results from this run. */
const checks = [];

/** Send a request with a timeout and verify its expected HTTP status. */
async function request(path, options, status) {
  const response = await fetch(new URL(path, baseUrl), {
    ...options,
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(response.status, status, `${options.method || "GET"} ${path}`);
  return response;
}

/** Verify the public error shape without accepting an HTML or empty response. */
async function checkError(name, options, status, path = "/api/v1/render") {
  const response = await request(path, options, status);
  const body = await response.json();
  assert.equal(typeof body.error?.code, "string");
  assert.equal(typeof body.error?.message, "string");
  checks.push({ name, status });
}

/** Build a render request without altering the caller's parameter object. */
function renderRequest(body) {
  return {
    method: "POST",
    headers: { ...authorization, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

/** Decode a real HTTP response, check its canvas pixels, and save the PNG. */
async function checkRender(name, parameters, background = "transparent") {
  const response = await request(
    "/api/v1/render",
    renderRequest(parameters),
    200,
  );
  assert.match(response.headers.get("content-type"), /^image\/png/);
  const png = Buffer.from(await response.arrayBuffer());
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  const image = await loadImage(png);
  assert.equal(image.width, 1024);
  assert.equal(image.height, 1024);
  const canvas = createCanvas(1024, 1024);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, 1024, 1024).data;
  if (background === "white") {
    assert.deepEqual(Array.from(pixels.subarray(0, 4)), [255, 255, 255, 255]);
  } else {
    assert.equal(
      pixels[3],
      0,
      "The transparent canvas keeps its top corner clear",
    );
  }
  assert.ok(pixels.some((value, index) => index % 4 === 3 && value > 0));
  let artworkPixels = 0;
  for (let index = 1024 * 400 * 4; index < pixels.length; index += 4) {
    if (
      pixels[index + 3] > 0 &&
      (pixels[index] < 245 ||
        pixels[index + 1] < 245 ||
        pixels[index + 2] < 245)
    )
      artworkPixels += 1;
  }
  assert.ok(
    artworkPixels > 100,
    "The lower canvas contains the selected artwork",
  );
  if (parameters.color === "#e2547b") {
    let pinkPixels = 0;
    for (let index = 0; index < 1024 * 240 * 4; index += 4) {
      if (
        pixels[index] > 170 &&
        pixels[index + 1] < 140 &&
        pixels[index + 2] > 70 &&
        pixels[index + 3] > 200
      )
        pinkPixels += 1;
    }
    assert.ok(
      pinkPixels > 100,
      "The requested caption color reaches the image",
    );
  }
  await writeFile(resolve(outputDirectory, `${name}.png`), png);
  checks.push({
    name,
    status: 200,
    width: image.width,
    height: image.height,
    bytes: png.length,
    sha256: createHash("sha256").update(png).digest("hex"),
  });
  return png;
}

await mkdir(outputDirectory, { recursive: true });
await request("/healthz", {}, 200);
checks.push({ name: "health", status: 200 });
await checkError("missing-key", {}, 401, "/api/v1/fonts");
await checkError(
  "wrong-key",
  { headers: { Authorization: "Bearer incorrect-smoke-check-key" } },
  401,
  "/api/v1/fonts",
);

/** Bundled catalogue returned by the running service. */
const { stickers } = await (
  await request("/api/v1/stickers", { headers: authorization }, 200)
).json();
/** Stable font identifiers advertised to clients. */
const { fonts } = await (
  await request("/api/v1/fonts", { headers: authorization }, 200)
).json();
assert.ok(stickers.length > 0);
assert.equal(new Set(stickers.map((item) => item.id)).size, stickers.length);
assert.deepEqual(
  fonts.map((font) => font.id).sort(),
  ["maoken", "zcool-kuaile", "zcool-qingke-huangyou", "ma-shan-zheng"].sort(),
);
checks.push({
  name: "catalogues",
  stickers: stickers.length,
  fonts: fonts.length,
});
/** The default transparent portrait, also used by the web editor. */
const portrait =
  stickers.find((item) => item.id === "d862eb062421f65d869091609b86f520.png") ||
  stickers.find((item) => item.origin === "archive");
/** Minimal valid request intentionally omits every optional setting. */
const basic = { stickerId: portrait.id, text: "肥鱼工坊来了！" };
await checkRender("defaults", basic);

/** Different bundled fonts must yield visibly different raster outputs. */
const fontHashes = new Set();
for (const font of fonts) {
  const png = await checkRender(font.id, {
    ...basic,
    font: font.id,
    color: "#e2547b",
  });
  fontHashes.add(createHash("sha256").update(png).digest("hex"));
}
assert.equal(fontHashes.size, fonts.length);
await checkRender(
  "white-overlay",
  { ...basic, background: "white", layout: "overlay" },
  "white",
);
await checkRender("transparent-overlay", { ...basic, layout: "overlay" });

for (const extension of [".webp", ".jpg", ".jpeg", ".gif"]) {
  const sticker = stickers.find((item) =>
    item.id.toLowerCase().endsWith(extension),
  );
  if (sticker)
    await checkRender(`source-${extension.slice(1)}`, {
      ...basic,
      stickerId: sticker.id,
    });
}
/** Workshop materials use the same API without being merged into archive provenance. */
const studio = stickers.find((item) => item.origin === "studio");
assert.ok(studio);
await checkRender("studio", {
  ...basic,
  stickerId: studio.id,
  text: "好耶！\n今天也开心",
});

for (const [name, changes, status] of [
  ["missing-sticker", { stickerId: "missing-sticker" }, 404],
  ["path-instead-of-id", { stickerId: "../../package.json" }, 404],
  ["blank-caption", { text: "   " }, 400],
  ["long-caption", { text: "鱼".repeat(201) }, 400],
  ["unknown-font", { font: "system-font" }, 400],
  ["invalid-color", { color: "red" }, 400],
  ["invalid-background", { background: "black" }, 400],
  ["invalid-layout", { layout: "custom" }, 400],
  ["advanced-parameter", { fontSize: 99 }, 400],
]) {
  await checkError(name, renderRequest({ ...basic, ...changes }), status);
}
await checkError("malformed-json", { ...renderRequest(basic), body: "{" }, 400);
await checkError(
  "wrong-content-type",
  {
    ...renderRequest(basic),
    headers: { ...authorization, "Content-Type": "text/plain" },
  },
  415,
);
await checkError(
  "oversized-body",
  renderRequest({ ...basic, text: "鱼".repeat(9000) }),
  413,
);
await writeFile(
  resolve(outputDirectory, "report.json"),
  JSON.stringify({ baseUrl, checks }, null, 2) + "\n",
);
console.log(
  `Passed ${checks.length} API checks. PNGs and report: ${outputDirectory}`,
);
