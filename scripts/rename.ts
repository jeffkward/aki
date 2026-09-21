/** Rename a fresh copy of aki into your own app.
 *
 *   bun run rename <name> [--title "My Cool App"] [--id com.example.name] [--keep-example] [--keep-git]
 *
 * Rewrites every place the app names itself, optionally drops the `widgets`
 * example resource, and starts a clean git history.
 *
 * Safe to read before running: it prints every file it touches AND anything it
 * could not rewrite. That second list matters — string-replace anchors go stale
 * the moment a formatter reflows a file, and a silent miss here ships an app
 * that passes its tests and fails to boot. */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { Glob } from "bun";
import { baseLine, identityFrom, rules } from "./lib/identity";

const EXAMPLE = "widgets";
const MOUNT_FN = `mount${EXAMPLE.charAt(0).toUpperCase()}${EXAMPLE.slice(1)}`;

const args = Bun.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const idFlag = args.indexOf("--id");
const bundleId = idFlag >= 0 ? args[idFlag + 1] : undefined;
const titleFlag = args.indexOf("--title");
const titleArg = titleFlag >= 0 ? args[titleFlag + 1] : undefined;
// Exclude flag VALUES by position, not by value: `rename dinoccino --title dinoccino`
// has the name and the title spelled identically, and a value match dropped both.
const flagValueAt = new Set([idFlag, titleFlag].filter((i) => i >= 0).map((i) => i + 1));
const raw = args.find((a, i) => !a.startsWith("--") && !flagValueAt.has(i));

if (!raw) {
  console.error(
    'usage: bun run rename <name> [--title "My Cool App"] [--id com.example.name] [--keep-example] [--keep-git]',
  );
  process.exit(1);
}

const identity = identityFrom(raw, { title: titleArg, id: bundleId });
const { slug, Title } = identity;
const touched: string[] = [];

const edit = (path: string, fn: (s: string) => string) => {
  if (!existsSync(path)) return;
  const before = readFileSync(path, "utf8");
  const after = fn(before);
  if (after !== before) {
    writeFileSync(path, after);
    touched.push(path);
  }
};

/* ── identity ─────────────────────────────────────────────────── */

// Every content rewrite lives in scripts/lib/identity.ts, shared with hotfix so
// a change pulled in later is rewritten exactly the way the rename did it.
for (const [file, fn] of Object.entries(rules(identity))) edit(file, fn);

edit(
  "README.md",
  () =>
    `# ${slug}\n\nBuilt on [aki](https://github.com/jeffkward/aki).\n\n\`\`\`bash\nbun install\nbun run dev     # → http://localhost:8787\n\`\`\`\n\nSee \`CLAUDE.md\` for the conventions and the component contract, and\n\`COMPONENTS.md\` for the component inventory.\n`,
);
edit("CLAUDE.md", (s) =>
  s.replace(
    /^# aki\n/,
    `# ${slug}\n\n*Built on [aki](https://github.com/jeffkward/aki) — the conventions below come from it.*\n`,
  ),
);

// Which aki this app was cut from. `bun run hotfix` diffs from here, so it is
// read before the history goes. Shallow clones still have a HEAD.
const head = Bun.spawnSync(["git", "rev-parse", "HEAD"]);
const base = head.exitCode === 0 ? head.stdout.toString().trim() : "unknown";

// A fresh UPSTREAM.md: the base aki commit, and somewhere obvious to jot what
// belongs back in aki. Porting is done from the aki repo, with a test.
edit(
  "UPSTREAM.md",
  () =>
    `# ${slug} and aki\n\n${baseLine(base)}\n\nThings learned building **${slug}** that belong in [aki](https://github.com/jeffkward/aki)\nrather than only here. Jot them as you go; port them later from the aki repo.\nOne line is enough — the point is not forgetting.\n\n**Worth taking back:** a component (or a prop an existing one should have had) ·\na convention · tooling · a trap that cost an hour.\n\n**Not worth taking back:** domain code, one-off styling, anything whose value\ndepends on this app's subject matter.\n\n## Open\n\n- _(nothing yet)_\n\n## Ported\n\n- _(nothing yet)_\n`,
);

/* ── the example resource ─────────────────────────────────────── */

const exampleLeftovers: string[] = [];

if (!flags.has("--keep-example")) {
  for (const f of [`app/routes/${EXAMPLE}.tsx`, `tests/${EXAMPLE}.test.ts`]) {
    if (existsSync(f)) {
      rmSync(f);
      touched.push(`${f} (removed)`);
    }
  }

  // Name the mount function EXACTLY. A generic /^mount\w+\(app\);/ matched the
  // FIRST mount call in the file — mountTheme — and removed the wrong one,
  // leaving the example's own call behind to crash at boot.
  edit("app/app.tsx", (s) =>
    s
      .replace(
        new RegExp(`^import \\{ ${MOUNT_FN} \\} from "\\./routes/${EXAMPLE}";\\n`, "m"),
        "",
      )
      .replace(new RegExp(`^${MOUNT_FN}\\(app\\);\\n`, "m"), "")
      .replace(new RegExp(`\\n\\s*<Tile\\s+href="/${EXAMPLE}"[\\s\\S]*?/>`), ""),
  );
  edit("db/schema.ts", (s) =>
    s.replace(
      new RegExp(`export const ${EXAMPLE}[\\s\\S]*$`),
      "// Your first table goes here. See .claude/skills/resource/SKILL.md\n",
    ),
  );

  for (const f of ["app/app.tsx", "db/schema.ts"]) {
    if (!existsSync(f)) continue;
    // Strip comments first — schema.ts's conventions comment NAMES the example
    // on purpose, and flagging that would be a false alarm every time.
    const code = readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    if (code.includes(EXAMPLE)) exampleLeftovers.push(f);
  }
  console.log(`• removed the \`${EXAMPLE}\` example (--keep-example keeps it as a reference)`);
}

/* ── report ───────────────────────────────────────────────────── */

const leftovers: string[] = [];
for (const f of [
  "package.json",
  "app/lib/paths.ts",
  "app/server.ts",
  "db/index.ts",
  "scripts/build-binary.ts",
  "scripts/package-mac.sh",
  "bunfig.toml",
  "app/app.tsx",
  "shell/main.swift",
]) {
  if (!existsSync(f)) continue;
  for (const [i, line] of readFileSync(f, "utf8").split("\n").entries()) {
    if (/\bAKI_|\baki\.db|"aki"|Aki\.app/.test(line))
      leftovers.push(`  ${f}:${i + 1}  ${line.trim()}`);
  }
}
// Skills are read by every agent session in the new app, so a stray "aki" there
// is not cosmetic — it is the old name in every prompt. Any mention counts.
// dot: true — Glob skips dot-directories by default and .claude is one; without
// it this loop silently finds nothing, which is the same as not scanning at all.
for (const f of new Glob(".claude/skills/*/SKILL.md").scanSync({ cwd: ".", dot: true })) {
  // The hotfix skill is ABOUT aki: pulling changes from it. Its mentions are the point.
  if (f.includes("/hotfix/")) continue;
  for (const [i, line] of readFileSync(f, "utf8").split("\n").entries()) {
    if (/\baki\b/i.test(line)) leftovers.push(`  ${f}:${i + 1}  ${line.trim()}`);
  }
}

console.log(`\n${Title} — files rewritten:`);
for (const t of touched) console.log(`  ${t}`);

if (exampleLeftovers.length) {
  console.log("\n⚠ the example was removed but these files still reference it:");
  for (const f of exampleLeftovers) console.log(`  ${f}  — edit by hand`);
}
if (leftovers.length) {
  console.log("\n⚠ still mentions aki (check these by hand):");
  for (const l of leftovers) console.log(l);
}

console.log(`
Next:
  1. rm -rf db/migrations && bun run db:generate     # your schema, your first migration
  2. bun run check                                   # format, regenerate COMPONENTS.md, test
  3. edit styles/tokens.css — the palette is what stops it looking generic
     (assets/icon.svg is the favicon; package:mac builds the app icon from it)
${flags.has("--keep-git") ? "" : "  4. git init && git add -A && git commit -m 'initial commit'"}
`);

if (!flags.has("--keep-git") && existsSync(".git")) {
  rmSync(".git", { recursive: true, force: true });
  console.log("• removed aki's git history (--keep-git keeps it)");
}
