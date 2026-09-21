import type { Database } from "bun:sqlite";
import { migrations } from "./migrations.generated";

/** Apply bundled migrations, once each, in order.
 *  Deliberately not drizzle's migrator: that one reads the migrations folder
 *  off disk with node:fs, which does not exist inside a compiled binary. */
export function migrateDb(sqlite: Database): string[] {
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS __aki_migrations (tag TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
  const done = new Set(
    sqlite
      .query("SELECT tag FROM __aki_migrations")
      .all()
      .map((r) => (r as { tag: string }).tag),
  );
  const applied: string[] = [];
  const insert = sqlite.prepare("INSERT INTO __aki_migrations (tag, applied_at) VALUES (?, ?)");
  for (const m of migrations) {
    if (done.has(m.tag)) continue;
    sqlite.transaction(() => {
      // drizzle separates statements with its own breakpoint marker
      for (const stmt of m.sql.split("--> statement-breakpoint")) {
        if (stmt.trim()) sqlite.exec(stmt);
      }
      insert.run(m.tag, Date.now());
    })();
    applied.push(m.tag);
  }
  return applied;
}
