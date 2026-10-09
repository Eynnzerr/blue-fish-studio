import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { SiteStats, StatsEventKind } from "../src/types.ts";

/** Durable counters with one transaction per event and permanent event-ID deduplication. */
export class StatsStore {
  /** SQLite connection owned by the running API process. */
  private readonly database: DatabaseSync;

  /** Open the persistent database and initialize its two small tables. */
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS stats_totals (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        visits INTEGER NOT NULL DEFAULT 0,
        exports INTEGER NOT NULL DEFAULT 0,
        started_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS stats_events (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('page_view', 'export')),
        created_at TEXT NOT NULL
      );
    `);
    this.database
      .prepare(
        "INSERT OR IGNORE INTO stats_totals (id, started_at) VALUES (1, ?)",
      )
      .run(new Date().toISOString());
  }

  /** Read both counters from the same committed row. */
  read(): SiteStats {
    return this.database
      .prepare(
        "SELECT visits, exports, started_at AS startedAt FROM stats_totals WHERE id = 1",
      )
      .get() as unknown as SiteStats;
  }

  /** Count a new event exactly once, including when requests race or are retried after restart. */
  record(id: string, kind: StatsEventKind): SiteStats {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const inserted = this.database
        .prepare(
          "INSERT OR IGNORE INTO stats_events (id, kind, created_at) VALUES (?, ?, ?)",
        )
        .run(id, kind, new Date().toISOString());
      if (inserted.changes) {
        this.database.exec(
          kind === "page_view"
            ? "UPDATE stats_totals SET visits = visits + 1 WHERE id = 1"
            : "UPDATE stats_totals SET exports = exports + 1 WHERE id = 1",
        );
      }
      const stats = this.read();
      this.database.exec("COMMIT");
      return stats;
    } catch (cause) {
      this.database.exec("ROLLBACK");
      throw cause;
    }
  }

  /** Release SQLite after all HTTP requests have finished. */
  close(): void {
    this.database.close();
  }
}
