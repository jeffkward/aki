/** Pull aki changes into this app.
 *
 *   bun run hotfix                      # what changed in aki since this app's base?
 *   bun run hotfix --apply              # apply every clean change, bump the base
 *   bun run hotfix --apply <file>...    # apply only these
 *   bun run hotfix --base <sha>         # override the base recorded in UPSTREAM.md
 *   bun run hotfix --ref <branch|sha>   # aki ref to pull from (default main)
 *   bun run hotfix --repo <url|path>    # where aki is (default GitHub; a local
 *                                       # checkout works and is faster)
 *   bun run hotfix --show <file>        # aki's version of one file, rewritten
 *                                       # for this app, on stdout (pipe to diff)
 *
 * Apps are snapshots of aki plus their own work, and `rename` rewrote the name
 * and env prefix throughout. So this is NOT a merge. For each file aki changed
 * since the base commit, it takes aki's patch, rewrites it with this app's
 * identity using the same rules rename used (scripts/lib/identity.ts), and
 * applies it with `git apply`. A patch that no longer fits, because this app
 * edited the same lines, is reported for a manual look, never forced.
 *
 * No base? (UPSTREAM.md predates this, or aki's history was rewritten.) It
 * falls back to comparing whole files: aki's version rewritten for this app
 * against the file here. Then --apply takes aki's version of the files you
 * NAME, and nothing else. */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  AKI_REPO,
  BASE_RE,
  baseLine,
  detectIdentity,
  rewrite,
  TEMPLATED,
} from "./lib/identity";

const args = Bun.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const apply = args.includes("--apply");
const show = flag("--show");
const ref = flag("--ref") ?? "main";
const repo = flag("--repo") ?? AKI_REPO;
const flagValues = new Set(
  ["--base", "--ref", "--repo", "--show"].map((f) => flag(f)).filter(Boolean),
);
const only = args.filter((a) => !a.startsWith("--") && !flagValues.has(a));

const die = (msg: string): never => {
  console.error(`hotfix: ${msg}`);
  process.exit(1);
};
const sh = (cmd: string[], cwd = ".") => {
  const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  return { ok: r.exitCode === 0, out: r.stdout.toString(), err: r.stderr.toString() };
};

if (!existsSync("package.json") || !existsSync("app/app.tsx"))
  die("run this from the app's root");
if (!sh(["git", "rev-parse", "--is-inside-work-tree"]).ok)
  die("this app is not a git repo; nothing to apply against");
if (apply && sh(["git", "status", "--porcelain"]).out.trim()) {
  die(
    "uncommitted changes here. Commit or stash first, so a bad hotfix is one `git checkout .` away",
  );
}

const identity = detectIdentity();
console.log(`${identity.Title} (${identity.slug}, ${identity.ENV}*)`);

const upstream = existsSync("UPSTREAM.md") ? readFileSync("UPSTREAM.md", "utf8") : "";
const base = flag("--base") ?? upstream.match(BASE_RE)?.[1];

/* ── fetch aki ────────────────────────────────────────────────── */

const aki = mkdtempSync(join(tmpdir(), "aki-hotfix-"));
process.on("exit", () => rmSync(aki, { recursive: true, force: true }));
// Files that need a hand are copied here, rewritten for this app, and this
// dir is NOT cleaned up: it is the thing you open next to the app's file.
const keep = mkdtempSync(join(tmpdir(), "aki-hotfix-manual-"));
const clone = sh(["git", "clone", "--quiet", repo, aki]);
if (!clone.ok) die(`could not clone ${repo}\n${clone.err}`);
const head = sh(["git", "rev-parse", ref], aki);
if (!head.ok) die(`no such ref in aki: ${ref}`);
const target = head.out.trim();
console.log(`aki ${ref} is ${target.slice(0, 7)}`);

const inAki = (file: string, at: string) => sh(["git", "show", `${at}:${file}`], aki);
const skip = (file: string) =>
  TEMPLATED.includes(file) || file.startsWith(".claude/skills/upstream");

// --show <file>: aki's version of one file, rewritten for this app, on stdout.
// `bun run hotfix --show app/server.ts | diff app/server.ts -` is the look.
if (show) {
  const r = inAki(show, target);
  if (!r.ok) die(`aki ${ref} has no ${show}`);
  process.stdout.write(rewrite(identity, show, r.out));
  process.exit(0);
}

/* ── named files this app lacks: add them from aki's tip ──────── */

// New files are never added unless NAMED: an app that dropped the widgets
// example must not get it back. This runs before the base check so a file can
// be added after the base was bumped past the commit that introduced it.
const added: string[] = [];
if (apply) {
  for (const file of only) {
    if (existsSync(file) || skip(file)) continue;
    const r = inAki(file, target);
    if (!r.ok) die(`aki ${ref} has no ${file}`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, rewrite(identity, file, r.out));
    added.push(file);
  }
  if (added.length) console.log(`added from aki:\n${added.map((f) => `  ${f}`).join("\n")}\n`);
}

/* ── with a base: patch mode ──────────────────────────────────── */

if (base && sh(["git", "cat-file", "-e", `${base}^{commit}`], aki).ok) {
  console.log(
    `base is ${base.slice(0, 7)} (from ${flag("--base") ? "--base" : "UPSTREAM.md"})\n`,
  );
  if (base === target) {
    console.log(
      added.length ? "base already at aki's tip." : "already at aki's tip. Nothing to pull.",
    );
    process.exit(0);
  }
  const changed = sh(["git", "diff", "--name-only", `${base}..${target}`], aki)
    .out.split("\n")
    .filter(Boolean)
    .filter((f) => !skip(f))
    .filter((f) => only.length === 0 || only.includes(f));
  if (changed.length === 0) {
    console.log("aki changed nothing this app carries.");
    process.exit(0);
  }

  const applied: string[] = [];
  const current: string[] = [];
  const manual: string[] = [];
  const absent: string[] = [];

  for (const file of changed) {
    const theirs = inAki(file, target);
    if (!theirs.ok) {
      // deleted in aki; not this tool's call to delete here
      manual.push(`${file}  (removed in aki; remove it here by hand if you agree)`);
      continue;
    }
    const wanted = rewrite(identity, file, theirs.out);
    if (!existsSync(file)) {
      absent.push(file); // new in aki since the base; see the pre-pass above
      continue;
    }
    if (readFileSync(file, "utf8") === wanted) {
      current.push(file);
      continue;
    }
    const patch = rewrite(
      identity,
      file,
      sh(["git", "diff", `${base}..${target}`, "--", file], aki).out,
    );
    const patchFile = join(aki, "hotfix.patch");
    writeFileSync(patchFile, patch);
    const check = sh(["git", "apply", "--check", patchFile]);
    if (!check.ok) {
      const copy = join(keep, file);
      mkdirSync(dirname(copy), { recursive: true });
      writeFileSync(copy, wanted);
      manual.push(
        `${file}  (this app changed the same lines; aki's version rewritten for it: ${copy})`,
      );
      continue;
    }
    if (apply) {
      const r = sh(["git", "apply", patchFile]);
      if (!r.ok) {
        manual.push(`${file}  (git apply failed after --check passed:\n${r.err})`);
        continue;
      }
    }
    applied.push(file);
  }

  const say = (title: string, list: string[]) => {
    if (list.length) console.log(`${title}\n${list.map((l) => `  ${l}`).join("\n")}\n`);
  };
  say(apply ? "applied:" : "would apply cleanly (add --apply):", applied);
  say("already current here:", current);
  say("new in aki (name them with --apply to add):", absent);
  say("needs a look by hand:", manual);

  if (apply && manual.length === 0 && upstream) {
    writeFileSync("UPSTREAM.md", upstream.replace(BASE_RE, baseLine(target)));
    console.log(
      `base bumped to ${target.slice(0, 7)} in UPSTREAM.md. Now: bun run check, then commit.`,
    );
  } else if (apply && manual.length) {
    console.log(
      `base NOT bumped. Finish the manual files, then set the Base line in UPSTREAM.md to ${target} yourself.`,
    );
  }
  process.exit(0);
}

/* ── no base: compare whole files ─────────────────────────────── */

console.log(
  base
    ? `base ${base.slice(0, 7)} is not in aki's history (rewritten?). Comparing whole files instead.\n`
    : "no base recorded in UPSTREAM.md. Comparing whole files instead.\n",
);
const tracked = sh(["git", "ls-tree", "-r", "--name-only", target], aki)
  .out.split("\n")
  .filter(Boolean)
  .filter((f) => !skip(f))
  .filter((f) => only.length === 0 || only.includes(f));

const differ: string[] = [];
const taken: string[] = [];
for (const file of tracked) {
  if (!existsSync(file)) continue; // whole-file mode never adds files
  const wanted = rewrite(identity, file, inAki(file, target).out);
  if (readFileSync(file, "utf8") === wanted) continue;
  if (apply && only.includes(file)) {
    writeFileSync(file, wanted);
    taken.push(file);
  } else {
    differ.push(file);
  }
}
if (taken.length)
  console.log(`took aki's version of:\n${taken.map((f) => `  ${f}`).join("\n")}\n`);
if (differ.length) {
  console.log(
    `differs from aki (this app's edits, aki's changes, or both; look before you take):\n${differ.map((f) => `  ${f}`).join("\n")}\n\nlook:  bun run hotfix --show <file> | diff <file> -\ntake:  bun run hotfix --apply <file>`,
  );
}
if (apply && taken.length && upstream) {
  writeFileSync(
    "UPSTREAM.md",
    upstream.match(BASE_RE)
      ? upstream.replace(BASE_RE, baseLine(target))
      : upstream.replace(/\n/, `\n\n${baseLine(target)}\n`),
  );
  console.log(
    `base set to ${target.slice(0, 7)} in UPSTREAM.md. Now: bun run check, then commit.`,
  );
}
