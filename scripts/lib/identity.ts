/** An app's identity, and every place in the tree that spells it.
 *
 *  Two consumers, and they MUST agree:
 *    - scripts/rename.ts turns a fresh aki clone into <slug>
 *    - scripts/hotfix.ts pulls a later aki change into an app that was renamed
 *      long ago, and has to rewrite the change the same way rename would have
 *
 *  So the rules live here, once. Add a place that spells the name? Add it here,
 *  and both tools learn it. */
import { existsSync, readFileSync } from "node:fs";

export const AKI_REPO = "https://github.com/jeffkward/aki.git";

export type Identity = {
  /** folder, package, database, exec name: "my-cool-app" */
  slug: string;
  /** display name: <title>, window title, .app name: "My Cool App" */
  Title: string;
  /** bundle id: "com.example.mycoolapp" */
  id: string;
  /** env-var prefix: "MY_COOL_APP_" */
  ENV: string;
};

export const slugify = (raw: string) =>
  raw
    .replace(/['\u2019]/g, "") // Tom's Kanban → toms-kanban, not tom-s-kanban
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // a RUN of punctuation is one hyphen: "Big" Co → big-co
    .replace(/^-+|-+$/g, "");

export function identityFrom(
  raw: string,
  opts: { title?: string; id?: string } = {},
): Identity {
  const slug = slugify(raw);
  // "My Cool App" wants to stay "My Cool App", not become "My-cool-app", so an
  // explicit title wins when the caller (the installer) knows it.
  const Title = opts.title?.trim() || slug.charAt(0).toUpperCase() + slug.slice(1);
  const id = opts.id ?? `com.example.${slug.replace(/-/g, "")}`;
  const ENV = `${slug.toUpperCase().replace(/-/g, "_")}_`;
  return { slug, Title, id, ENV };
}

/** Read the identity back out of an already-renamed app. Each field comes from
 *  the one file that owns it, so a hand edit there is respected. */
export function detectIdentity(root = "."): Identity {
  const read = (p: string) =>
    existsSync(`${root}/${p}`) ? readFileSync(`${root}/${p}`, "utf8") : "";
  const slug = (JSON.parse(read("package.json") || "{}").name as string | undefined) ?? "aki";
  const Title = read("app/lib/layout.tsx").match(/export const APP_NAME = "([^"]*)";/)?.[1];
  const id = read("scripts/package-mac.sh").match(/BUNDLE_ID:-([^}"]+)/)?.[1];
  return identityFrom(slug, { title: Title, id });
}

/** Files rename REPLACES wholesale with a template. They are the app's own from
 *  the first minute and a hotfix must never touch them. */
export const TEMPLATED = ["README.md", "CLAUDE.md", "UPSTREAM.md"];

/** Per-file content rewrites: aki's spelling → this app's. Applied to a whole
 *  file by rename, and to a patch of that file by hotfix. Keep every rule
 *  line-local (no /^...\n/ across lines) so it also works inside a diff hunk. */
export function rules({
  slug,
  Title,
  id,
  ENV,
}: Identity): Record<string, (s: string) => string> {
  const env = (s: string) => s.replace(/AKI_/g, ENV).replace(/aki\.db/g, `${slug}.db`);
  // The display name is free text: Tom's Kanban, "Aki" Two, R&D. Each file
  // that carries a literal copy gets it escaped for THAT syntax. Code reads
  // APP_NAME from app/lib/layout.tsx instead of carrying a copy at all.
  const str = JSON.stringify(Title); // a TS / Swift / JSON string literal
  const sh = `'${Title.replace(/'/g, "'\\''")}'`; // a single-quoted shell word
  return {
    "package.json": (s) =>
      s.replace(/"name":\s*"aki"/, `"name": "${slug}"`).replace(/AKI_/g, ENV),
    // The env prefix must move in EVERY file at once. Renaming it in paths.ts
    // but not in build-binary.ts left AKI_PACKAGED defined and <NAME>_PACKAGED
    // read: packaged mode silently off, the app writing beside a read-only
    // binary. shell/main.swift is here because it SETS two of these for the
    // server; left behind, a renamed app's window opened a browser beside itself
    // and its orphan watchdog never armed.
    "app/lib/paths.ts": (s) =>
      env(s)
        .replace(/"aki"/g, `"${slug}"`)
        .replace(/Application Support\/aki/g, `Application Support/${slug}`),
    "app/server.ts": env,
    "scripts/build-binary.ts": (s) =>
      env(s)
        .replace(/title: "aki"/, `title: ${str}`)
        .replace(/publisher: "Aki"/, `publisher: ${str}`),
    "bunfig.toml": env,
    // The window-title fallback when Info.plist has no CFBundleName.
    "shell/main.swift": (s) => env(s).replace(/\?\? "aki"/, `?? ${str}`),
    "db/index.ts": (s) => s.replace(/aki\.db/g, `${slug}.db`),
    "scripts/package-mac.sh": (s) =>
      s
        .replace(/APP_NAME_DEFAULT='Aki'/, `APP_NAME_DEFAULT=${sh}`)
        .replace(/EXEC_NAME:-aki/, `EXEC_NAME:-${slug}`)
        .replace(/BUNDLE_ID:-com\.example\.aki/, `BUNDLE_ID:-${id}`),
    "packaging/tauri.conf.stub.json": (s) =>
      s
        .replace(/"identifier": "com\.example\.aki"/, `"identifier": "${id}"`)
        .replace(/"productName": "Aki"/, `"productName": ${str}`)
        .replace(/"title": "aki"/, `"title": ${str}`),
    "app/app.tsx": (s) =>
      s
        .replace(/alt="aki"/, `alt="${slug}"`)
        // The landing page's first "Next" step is to run rename. Once it has
        // run, that hint is stale advice on the new app's own home page.
        .replace(/\n\s*<li>\s*Make it yours: <code>bun run rename[\s\S]*?<\/li>/, ""),
    // APP_NAME is the single place the display name is spelled; it feeds
    // <title> and the native window title.
    "app/lib/layout.tsx": (s) =>
      s.replace(/export const APP_NAME = "Aki";/, `export const APP_NAME = ${str};`),
  };
}

/** Rewrite one file's content (or a patch of it) from aki's spelling to the
 *  app's. Files without a rule pass through unchanged. */
export function rewrite(identity: Identity, file: string, content: string): string {
  const fn = rules(identity)[file];
  return fn ? fn(content) : content;
}

/** The line rename writes into UPSTREAM.md, and hotfix reads back and rewrites
 *  whole, so the date moves with the sha. */
export const BASE_RE = /^\*\*Base:\*\* aki `([0-9a-f]{7,40})`.*$/m;
export const baseLine = (sha: string, date = new Date().toISOString().slice(0, 10)) =>
  `**Base:** aki \`${sha}\` (${date}). \`bun run hotfix\` diffs from here.`;
