/** Compile aki to a single self-contained executable.
 *  CSS, HTMX and the migrations are bundled as text imports (not embedded
 *  assets — node:fs cannot see those), so the binary needs nothing beside it.
 *  Run `bun run css:build` first: public/app.css must exist to be bundled.
 *  Usage: bun run scripts/build-binary.ts [target] */
import { rmSync } from "node:fs";

const target = (Bun.argv[2] ?? "bun-darwin-arm64") as never;
const outfile = `dist/aki${target.includes("windows") ? ".exe" : ""}`;
rmSync(outfile, { force: true });

const result = await Bun.build({
  entrypoints: ["./app/server.ts"],
  compile: {
    target,
    outfile,
    windows: { title: "aki", publisher: "Aki", hideConsole: true },
  },
  minify: true,
  sourcemap: "linked",
  define: { "process.env.AKI_PACKAGED": '"1"' },
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
console.log(`${outfile}  (${target})`);
