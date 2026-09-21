# aki

A starter for new apps: TypeScript + Bun + Hono, server-rendered JSX with HTMX, Drizzle over SQLite, and a component library with a contract that a coding agent cannot quietly drift out of.

## ⚠️ Read this before writing any UI

**1. Check `COMPONENTS.md` first.** It is generated from `app/components/` and lists every component, what it's for, and its props. If something is there, use it.

**2. Import from the barrel, never deep:**
```tsx
import { Button, Card, Field } from "../components";   // ✅
import { Button } from "../components/button";          // ❌
```

**⚠️ 3a. `styles/app.css` imports base and component CSS WITH `layer(...)`.** Do not remove that. Unlayered CSS beats every `@layer`, so without it a bare `h3 { margin: 1.6em 0 }` in `base.css` outranks `.mt-0` and every Tailwind utility touching a property your CSS sets silently stops working. A test asserts the order.

**3. Never inline a colour. Never use a Tailwind colour utility.** Colour, type and shape come from the tokens in `styles/tokens.css` (`--bg --card --border --text --muted --primary --accent --danger --ok …`). Tailwind is for **layout and typography** — `flex`, `gap-3`, `mt-4`, `max-w-4xl`, and the token-backed `text-h1 … text-meta`, `font-display|body|mono`, `rounded-card|btn`. Those come from `@theme inline` in `tokens.css`, so they emit `var(--token)` and follow `[data-theme]` at run time.

**Colour is the exception: it never comes from a utility.** `bg-slate-900` and `style="color:#333"` both fail the test suite. Colour lives in a component's own `.css` beside it, using tokens — one vocabulary, not two.

Typography can be written either way and the numbers cannot drift: an unclassed `<h1>` gets the scale from `base.css`, and `class="text-h2"` pulls the same `--size-h2` token. See the **Type scale** section at `/theme`.

**4. Adding a component?** Use `.claude/skills/component/SKILL.md`. Four things must happen or `bun test` goes red:
  - the file in `app/components/<name>.tsx`
  - an export in `app/components/index.ts`
  - a rendered example in `app/routes/theme.tsx`
  - `bun run components:index` to refresh `COMPONENTS.md`

**5. Adding a resource?** Use `.claude/skills/resource/SKILL.md`. Copy `app/routes/widgets.tsx` — it is the reference implementation, deliberately. Throw away widgets when you don't need it anymore.

## Conventions (Rails-shaped)

| Thing | Rule |
|---|---|
| Table name | **plural** — `widgets`, `organizations` |
| Exported table const | **plural** — `export const widgets` |
| Row type | **singular** — `export type Item` |
| Primary key | `id`, integer, autoincrement — use `pk` from `db/columns.ts` |
| Timestamps | always `...timestamps` — gives `created_at` / `updated_at`, auto-touched |
| Route path | plural collection (`/widgets`), `:id` for the member (`/widgets/:id`) |
| Routes | RESTful via `resources()` in `app/lib/resources.ts` |
| Validation | Zod at the boundary, always — `zValidator("form" \| "json", Schema)` |
| HTML forms | **POST only.** There is no Rails `_method` trick. Put the action in the path, or let HTMX send the verb |
| Fragments | write handlers that return **HTML fragments**, not JSON, for HTMX swaps |

### Where it differs from Rails

| Rails | aki |
|---|---|
| Puma | nothing. Bun *is* the app server |
| `rails routes` | `showRoutes()`, printed on boot |
| `rails db:migrate` | `bun run db:generate` then `bun run db:migrate` |
| ActiveRecord validations | **Zod**: validates *and* infers the type from one declaration |
| `form_for` + `_method=PATCH` | no `_method` trick. Forms are POST-only; HTMX sends `hx-patch` / `hx-delete` |
| Turbo frames / streams | HTMX `hx-*`; handlers return fragments |
| ERB / ViewComponent | `hono/jsx` |
| `rails c` | no equivalent worth pretending about |

A resource test needs no server and no browser, just the real database:

```ts
const res = await app.request("/widgets", {
  method: "POST",
  body: new URLSearchParams({ name: "Sprocket", price: "19.99" }),
});
expect(res.status).toBe(201);
```

## Layout

```
app/components/      			the component library — two files per component
app/components/index.ts   the barrel (import from here)
app/routes/theme.tsx      the gallery — registration is MANDATORY
app/routes/widgets.tsx    the reference resource — copy its shape
app/lib/layout.tsx        the document shell
app/lib/resources.ts      the resources() helper
app/lib/themes.ts         parses the theme list out of tokens.css
app/app.tsx               the Hono app
app/server.ts             Bun.serve entry
db/schema.ts              tables (plural) + row types (singular)
db/columns.ts             pk + timestamps — spread into every table
db/index.ts               connection + the PRAGMAs that matter
styles/tokens.css         COLOUR / TYPE / SHAPE — the only place colour lives
styles/base.css           page base; component CSS lives beside each component
scripts/components-index.ts  generates COMPONENTS.md
tests/                    the contract tests (the teeth) + resource tests
```

## Where work happens

Change aki **in the aki repo**, with a test. Build each app in its own repo. Working on aki from a session rooted somewhere else works, but it works blind: the contract, the conventions and the traps are all in this file and in this test suite.

**Fixes flow aki → app with `bun run hotfix`** (see `.claude/skills/hotfix/SKILL.md`): it diffs aki against the base commit recorded in `UPSTREAM.md`, rewrites the change with this app's name and env prefix (the same rules `rename` used, from `scripts/lib/identity.ts`), and applies it. Never git-merge aki into an app.

**Improvements flow one way: app → aki.** Apps are snapshots; aki is what improves. Each app gets an `UPSTREAM.md` for jotting what belongs back; port it from the aki repo the way the component or resource skill would have added it, and **land it with a test**. Do **not** git-merge an app into aki (`rename` rewrites the package name, data dir, env prefix and docs — permanent conflicts), and do **not** publish the components as a package (it reintroduces the version skew the design exists to avoid).

## Starting a new app from aki

```bash
bun run rename <name> [--title "My Cool App"]   # rename everything, drop widgets, reset git
```

Renames the package, the data directory, the env-var prefix (`AKI_*`), the window title, the packaging defaults, README and this file — then **prints anything it could not rename**, so a half-rename is visible rather than silent. `--title` is the display name (window title, `.app` name); without it the slug is capitalised. `--keep-example` keeps `widgets` as a reference; `--keep-git` keeps the history.

`scripts/install.sh` is the one-line installer the README advertises: it asks for a name, clones, runs `rename --keep-example`, makes the first commit and starts the dev server. Keep it in step with `rename` when the flags change.

After renaming: `rm -rf db/migrations && bun run db:generate`, then edit `styles/tokens.css` — the palette is what stops it looking like every other app. `assets/icon.svg` is the favicon and welcome image; `package:mac` builds the `.icns` from it on its own, so `bun run icon` is never a required step.

## Packaging

```bash
bun run build:binary     # one self-contained executable
bun run package:mac      # → dist/<Name>.app + dist/<Name>-<version>.dmg
```

`package:mac` builds a **macOS window**: `shell/main.swift` is a real NSApplication wrapping the server in a `WKWebView` (system WebKit — no Electron, no Rust). It spawns `Contents/MacOS/server` on a free port and kills it on quit, via signal handlers *and* a parent-watchdog in `app/server.ts`. Do not "simplify" that watchdog to `process.ppid` — **Bun caches it at startup**, so it reports a dead parent forever.

Settings (window size, port, devtools) resolve **defaults → Info.plist → UserDefaults**; the full key table is in `packaging/README.md`. Ship anything real with `UNIVERSAL=1` or it will not launch on the other kind of Mac. **Users need nothing installed** — not Bun, not Node, not a database.

Read `packaging/README.md` before trying to distribute: you need a **Developer ID Application** certificate (an "Apple Development" one is rejected by Gatekeeper and cannot be notarized), and a Bun binary needs JIT entitlements under a hardened runtime or it crashes on launch on someone else's Mac.

Everything the binary needs is **bundled as text imports** — `public/app.css`, `public/htmx.min.js` and `db/migrations.generated.ts`. Do not switch these back to filesystem reads: a compiled binary has no `./public`, and Bun's embedded assets are invisible to `node:fs`, which is what drizzle's own migrator uses. That is why `db/migrate.ts` exists instead of drizzle's migrator.

## Commands

```bash
bun install
bun run dev              # Tailwind watch + hot-reloading server on :8787
bun run test             # contract tests + resource tests
bun run check            # biome --write, regenerate COMPONENTS.md, test
bun run components:index  # refresh COMPONENTS.md after adding a component
bun run db:generate      # drizzle-kit: create a migration from schema.ts
bun run db:migrate       # apply migrations
bun run css:build        # one-shot CSS build
bun run build:binary     # single self-contained executable
bun run package:mac      # .app + .dmg (see packaging/README.md)
bun run rename <name>    # make this repo your own app
bun run hotfix           # pull aki changes since this app's base commit (see the hotfix skill)
```

Routes print on boot (`showRoutes`) — that's `rails routes`.

## Why the tests are shaped this way

A rule in this file degrades over a long session; a red test does not. The suite asserts that every component is barrelled, registered in `/theme`, and present in `COMPONENTS.md`; that no colour literal appears in component CSS, in an inline `style`, or as a Tailwind colour utility; that every theme defines both light and dark; and that the focus-ring enumeration and `:disabled` rule still exist.

## Stack notes

- **`tsconfig.json`** sets `jsx: react-jsx` and `jsxImportSource: hono/jsx`. Without both, JSX silently tries to use React.
- **HTMX is vendored** at `public/htmx.min.js` (pinned via `package.json`), not on a CDN.
- **SQLite** — `makeDb()` sets `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`. Keep write transactions short: SQLite allows one writer at a time. Never put the database on a network filesystem (NFS/SMB/Dropbox/iCloud) — that corrupts, it doesn't just slow down.
- **Tests** use a throwaway `.test.db`, removed by the `test` script *before* the process starts (import hoisting means it cannot be removed from `tests/setup.ts`).
- **Deploying** is one process, one port, one SQLite file: the compiled binary under systemd on a VPS, `FROM oven/bun` in Docker, or a Fly/Railway/Render box with a persistent disk and `PORT` set. Cloudflare Workers is *not* a drop-in: no `bun:sqlite`, no `node:fs`. Hono runs there fine, so it is a data-layer swap, not a rewrite.
