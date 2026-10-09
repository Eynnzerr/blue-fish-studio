import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Separate database and generated PNGs keep smoke traffic out of real site totals. */
const directory = await mkdtemp(join(tmpdir(), "blue-fish-stats-"));
/** Browser origin accepted by the isolated service. */
const origin = "http://127.0.0.1:5174";
/** Throwaway credential used only by the isolated rendering API. */
const apiKey = randomUUID();
/** Selected ephemeral port reused for the restart check. */
const portProbe = createServer();
portProbe.listen(0, "127.0.0.1");
await once(portProbe, "listening");
const port = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
/** HTTP entry point for every assertion below. */
const base = `http://127.0.0.1:${port}`;
/** Current API subprocess and its diagnostic output. */
let service;
let logs = "";

/** Start the real API against the same isolated database after each restart. */
async function start(rateLimit = "200") {
  logs = "";
  service = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    env: {
      ...process.env,
      API_KEY: apiKey,
      HOST: "127.0.0.1",
      PORT: String(port),
      STATS_DB_PATH: join(directory, "stats.sqlite"),
      STATS_ALLOWED_ORIGINS: origin,
      STATS_RATE_LIMIT_PER_MINUTE: rateLimit,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  service.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  service.stderr.on("data", (chunk) => {
    logs += chunk;
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (service.exitCode !== null) throw new Error(logs);
    try {
      if ((await fetch(`${base}/healthz`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Service did not start: ${logs}`);
}

/** Stop gracefully so SQLite is closed before the next process opens it. */
async function stop() {
  if (!service || service.exitCode !== null) return;
  const exited = once(service, "exit");
  service.kill("SIGTERM");
  const timer = setTimeout(() => service.kill("SIGKILL"), 12_000);
  await exited;
  clearTimeout(timer);
}

/** Make a real request and verify its status before reading its JSON response. */
async function request(path = "/api/v1/stats", options = {}, expected = 200) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(response.status, expected, `${options.method ?? "GET"} ${path}`);
  return response;
}

/** Construct a browser event request without privileged credentials. */
function eventOptions(kind, id = randomUUID()) {
  return {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ id, kind }),
  };
}

/** Submit one event and return the committed totals. */
async function event(kind, id) {
  return (await request("/api/v1/stats/events", eventOptions(kind, id))).json();
}

try {
  await start();
  const fresh = await (await request()).json();
  assert.equal(fresh.visits, 0);
  assert.equal(fresh.exports, 0);
  assert.ok(Number.isFinite(Date.parse(fresh.startedAt)));

  const visitId = randomUUID();
  await event("page_view", visitId);
  assert.equal((await event("page_view", visitId)).visits, 1);
  const exportId = randomUUID();
  await Promise.all(
    Array.from({ length: 12 }, () => event("export", exportId)),
  );
  assert.equal((await (await request()).json()).exports, 1);
  await Promise.all(Array.from({ length: 12 }, () => event("page_view")));
  await Promise.all(Array.from({ length: 12 }, () => event("export")));
  let totals = await (await request()).json();
  assert.deepEqual(totals, { ...fresh, visits: 13, exports: 13 });
  console.log(
    "PASS: fresh counters, concurrent unique events and duplicate-event suppression",
  );

  const preflight = await request(
    "/api/v1/stats/events",
    {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    },
    204,
  );
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
  await request(
    "/api/v1/stats/events",
    {
      ...eventOptions("export"),
      headers: {
        Origin: "https://untrusted.invalid",
        "Content-Type": "application/json",
      },
    },
    403,
  );
  await request(
    "/api/v1/stats/events",
    {
      ...eventOptions("export"),
      headers: { "Content-Type": "application/json" },
    },
    403,
  );
  await request(
    "/api/v1/stats/events",
    {
      ...eventOptions("export"),
      headers: { Origin: origin, "Content-Type": "text/plain" },
    },
    415,
  );
  await request(
    "/api/v1/stats/events",
    { ...eventOptions("export"), body: "{" },
    400,
  );
  for (const payload of [
    null,
    [],
    {},
    { id: randomUUID(), kind: "preview" },
    { id: "invalid", kind: "export" },
    { id: randomUUID(), kind: "export", count: 500 },
  ]) {
    await request(
      "/api/v1/stats/events",
      { ...eventOptions("export"), body: JSON.stringify(payload) },
      400,
    );
  }
  await request(
    "/api/v1/stats/events",
    {
      ...eventOptions("export"),
      body: JSON.stringify({ text: "x".repeat(9000) }),
    },
    413,
  );
  await request(
    "/api/v1/stats",
    { method: "DELETE", headers: { Origin: origin } },
    405,
  );
  assert.deepEqual(await (await request()).json(), totals);
  console.log(
    "PASS: CORS, origin checks, event validation and rejected requests leave totals unchanged",
  );

  // Exercise the existing rendering API and confirm its traffic is outside website counters.
  const regression = spawn(process.execPath, ["scripts/check-api.mjs"], {
    env: {
      ...process.env,
      API_BASE_URL: base,
      API_KEY: apiKey,
      API_SMOKE_OUTPUT: join(directory, "api-smoke"),
    },
    stdio: ["ignore", "inherit", "inherit"],
  });
  const [code] = await once(regression, "exit");
  assert.equal(code, 0, "Existing image API smoke checks");
  assert.deepEqual(await (await request()).json(), totals);

  await stop();
  await start();
  assert.deepEqual(await (await request()).json(), totals);
  await event("page_view", visitId);
  await event("export", exportId);
  assert.deepEqual(await (await request()).json(), totals);
  console.log("PASS: counters and deduplication survive process restart");

  await stop();
  await start("2");
  await request();
  await request();
  const limited = await request("/api/v1/stats", {}, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  console.log(
    "PASS: statistics rate limit is enforced independently of rendering",
  );
  console.log("All statistics integration checks passed.");
} finally {
  await stop();
  await rm(directory, { recursive: true, force: true });
}
