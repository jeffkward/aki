import { showRoutes } from "hono/dev";
import { sqlite } from "../db";
import { migrateDb } from "../db/migrate";
import { app } from "./app";
import { APP_NAME } from "./lib/layout";
import { packaged } from "./lib/paths";

/* Migrate on boot. A fresh clone — or a shipped .app on someone else's Mac —
   should just run. Drizzle records what it applied, so this is a no-op after. */
migrateDb(sqlite);

// `|| 8787`, not `?? 8787`: a PORT that is set but not a number must fall back
// to the default, not become NaN. Bun treats a NaN port as "pick one", which
// starts the app on a random port while this file prints localhost:NaN.
const port = Number(process.env.PORT) || 8787;
const url = `http://localhost:${port}`;

if (!packaged) showRoutes(app, { verbose: false });
console.log(`${APP_NAME} → ${url}`);

/* Packaged, there is no terminal to read that line from — open the browser.
   AKI_NO_OPEN=1 suppresses it (tests, servers, CI). */
if (packaged && process.env.AKI_NO_OPEN !== "1") {
  Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" });
}

/* Die with the parent. Belt-and-braces for the native shell: if the shell is
   killed -9 or crashes, none of its handlers run, macOS reparents this process
   to launchd, and it would linger holding the database with no window attached.

   NOTE: do NOT use process.ppid for this. Bun CACHES it at startup — after the
   parent dies it keeps reporting the old pid forever, while the real ppid is 1.
   (Node's process.ppid is a live getter; Bun's is not.) Probing the parent pid
   directly is the check that actually works. */
const parentPid = Number(process.env.AKI_PARENT_PID ?? 0);
if (parentPid > 0) {
  setInterval(() => {
    try {
      process.kill(parentPid, 0); // signal 0 = "does this process exist?"
    } catch {
      process.exit(0);
    }
  }, 1000).unref();
}

export default { port, fetch: app.fetch };
