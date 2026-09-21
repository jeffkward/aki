# aki

*aki* is **land, earth** in Anishinaabemowin. Where we're building.

## Why this exists...

I've spent a lot of time building on Rails, with a lot of JavaScript along the way. This is an exploratory project to learn about different ways to build and deploy web-apps. Every choice in it is deliberate, and I'm building on it and learning it at the same time.

What I was after:

- Easy deployment, in the cloud and locally. Something that scales as an ordinary web app but can also be installed on one machine by someone who isn't technical.
- Wrapped as a Mac or PC app with an installer, run fully in the cloud, or both, from one codebase.
- A solid developer community behind each piece, and documentation good enough that coding agents can work in it without guessing.
- Supportive of data sovereignty principles with multiple deployment possibilities.

That's a tall order, I know. I'll update this repo as I go.

Bun is what makes the rest possible. It's written in Zig, and it's the runtime, the package manager, the bundler and the test runner in one binary. Its compiler folds the runtime, your code, the CSS, HTMX and the migrations into a single executable. That's what lets the same app be a cloud service one day and a double-click install the next.

## The stack…

**TypeScript · Bun · Hono · server-rendered JSX + HTMX · Zod · Drizzle · SQLite · Tailwind (layout only) · Biome**

No client framework. No build step for the UI.

| Choice | Why |
|---|---|
| **Bun** | One binary for runtime, installer, bundler and tests. `bun build --compile` is what makes the desktop app possible. |
| **Hono** | Web-standard `Request` and `Response`, so the same app runs on Bun, Node, Deno or Workers. It never needs replacing as the app grows. |
| **JSX + HTMX, no SPA** | The server is the only thing that knows how to render. No client state to sync, nothing to hydrate. |
| **Zod** | TypeScript checks nothing at runtime. One declaration gives you validation and the type, so they can't drift apart. |
| **Drizzle + SQLite** | In-process, so a query is a function call. One file the user owns, and the schema is TypeScript. Graduate to Postgres later if you need it. |
| **Tailwind** | A subset of Tailwind for its utilities, layout and type. Colour comes from your tokens, never from Tailwind. |
| **Your UI Components** | A simple component library that you make your own. |
| **Biome** | One fast tool for formatting and linting. |

As a Rails developer I was always going to make some familiar choices, and if you've worked in Rails you'll spot the nods: plural tables, RESTful resources, migrations, validation at the boundary. The full conventions are in [`CLAUDE.md`](CLAUDE.md). It's written for coding agents, and it reads fine for people.

## Quick Start

Bun is the only thing you need installed. No Node, no Docker, no Postgres. The installer offers to install Bun if it isn't there.

**One line.** It asks what your app is called, then does the rest:

```bash
curl -fsSL https://raw.githubusercontent.com/jeffkward/aki/main/scripts/install.sh | bash
```

Answer "My Cool App" and you get a `my-cool-app` folder with everything renamed, the `widgets` example kept so there's working CRUD to copy from, a fresh git history with a first commit, and the dev server running on a free port. It finishes by printing the commands you'll use most, including how to build it as a Mac app.

**Or by hand, in two steps:**

```bash
git clone https://github.com/jeffkward/aki.git my-cool-app && cd my-cool-app && bun install
bun run rename my-cool-app --title "My Cool App" --keep-example
```

Then `bun run dev` and open http://localhost:8787. Drop `--keep-example` to start without the widgets resource. (`bun create jeffkward/aki my-cool-app` and GitHub's **Use this template** button both work in place of the clone.)

What's there on first run:

| | |
|---|---|
| `/` | the welcome page |
| `/theme` | every component, nine themes, light and dark |
| `/widgets` | the CRUD example, the reference for your own resources |

Two things to do next:

1. Edit `styles/tokens.css`. The palette is what stops it looking like every other app.
2. Put your first table in `db/schema.ts`, then `bun run db:generate && bun run db:migrate`.

`assets/icon.svg` is the favicon and the welcome-page image. Swap it whenever you like.

## Commands

```bash
bun run dev              # Tailwind watch + hot-reloading server on :8787
bun run test             # contract tests + resource tests
bun run check            # biome --write, regenerate COMPONENTS.md, test
bun run components:index # refresh COMPONENTS.md + the CSS index
bun run db:generate      # migration from schema.ts (bundled for the binary too)
bun run db:migrate       # apply migrations
bun run rename <name>    # make this repo your own app (--title, --keep-example, --keep-git)
bun run build:binary     # single self-contained executable
bun run package:mac      # .app + .dmg (see packaging/README.md)
bun run icon             # macOS app icon from assets/icon.svg (package:mac runs this itself)
```

## Deploying

It's an ordinary web app: one process, one port, one SQLite file. That means a VPS with the compiled binary under systemd, a Docker image from `oven/bun`, or a Fly, Railway or Render box with a persistent disk. Keep the database on local disk. SQLite on a network filesystem corrupts, it doesn't just slow down.

For the desktop, `bun run package:mac` compiles everything into one executable, wraps it in a macOS window using the system WebKit, and builds the app icon from `assets/icon.svg` on the way. No Electron, and your users install nothing. You'll need an Apple Developer ID certificate before you can hand it to anyone else. [`packaging/README.md`](packaging/README.md) has the whole story, including the current limitations and what's planned for Windows.

## License

[MIT](LICENSE) © 2026 Jeff Ward
