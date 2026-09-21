/** Test bootstrap: migrate the throwaway database before any test runs.
 *
 *  The file itself is deleted by the `test` script, NOT here: `import`
 *  statements are hoisted, so importing ../db opens the connection before any
 *  statement in this file executes — deleting the file afterwards left the app
 *  holding a stale handle and every query failed SQLITE_IOERR_VNODE on macOS.
 *
 *  Uses the same bundled migrator as the app: one code path, so a migration
 *  that works in tests works in the shipped binary. */
import { sqlite } from "../db";
import { migrateDb } from "../db/migrate";

migrateDb(sqlite);
