import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { dbPath } from "../app/lib/paths";
import * as schema from "./schema";

/** Open a database with the PRAGMAs that separate "fast" from "why is this slow".
 *  Pass ":memory:" in tests — a fresh isolated DB per run, created instantly. */
export function makeDb(url = dbPath()) {
  const sqlite = new Database(url);
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA synchronous = NORMAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec("PRAGMA busy_timeout = 5000;");
  return { db: drizzle(sqlite, { schema }), sqlite };
}

export const { db, sqlite } = makeDb();
