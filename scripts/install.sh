#!/bin/bash
# aki installer: a new app from the starter, in one command.
#
#   curl -fsSL https://raw.githubusercontent.com/jeffkward/aki/main/scripts/install.sh | bash
#     (asks for your app's name, then does everything below)
#   bash scripts/install.sh "My Cool App"      # from a local clone, no prompts
#
# What it does, in order:
#   1. checks for git and bun (offers to install bun if it's missing)
#   2. asks what the app is called and derives the folder / package name
#      ("My Cool App" → my-cool-app); refuses to overwrite an existing folder
#   3. clones aki into that folder
#   4. bun install, then `bun run rename` with --keep-example, so the widgets
#      CRUD example is there to copy from; aki's git history is wiped and a
#      fresh first commit is made
#   5. builds the CSS, picks a free port, prints the command list, and starts
#      the dev server. Ctrl-C stops it; `bun run dev` starts it again.
#
# Env overrides (for testing and packaging):
#   AKI_REPO_URL   what to clone            (https://github.com/jeffkward/aki.git)
#   AKI_PORT       port to try first        (8787)
#   AKI_NO_SERVE=1 do everything except start the server
set -euo pipefail

REPO_URL="${AKI_REPO_URL:-https://github.com/jeffkward/aki.git}"

die() { echo "aki install: $*" >&2; exit 1; }
note() { echo "• $*"; }

# Piped from curl, stdin IS the script: bash reads it line by line as it runs.
# Two consequences shape everything below. First, never `exec < /dev/tty`: that
# points bash at the terminal and it waits for you to type the rest of the
# script. Prompts read from /dev/tty explicitly instead. Second, the body is a
# function called on the last line, so bash has parsed the whole file before
# any command runs and a child that reads stdin can't swallow half the script.
# An actual open is the only proof the terminal is there; [ -r /dev/tty ]
# passes on headless boxes where it isn't.
HAVE_TTY=0
if ( : < /dev/tty ) 2>/dev/null; then HAVE_TTY=1; fi
ask() {  # ask "<prompt>" VAR  — reads a line from the terminal, not from stdin
  local prompt="$1" var="$2"
  printf '%s' "$prompt" > /dev/tty
  IFS= read -r "$var" < /dev/tty
}

main() {

# ── 1. tools ──────────────────────────────────────────────────────────────
command -v git >/dev/null || die "git not found. Install it and re-run."

if ! command -v bun >/dev/null; then
  echo "Bun isn't installed. It's the only runtime aki needs (no Node, no Docker)."
  if [ "$HAVE_TTY" = 1 ]; then
    ask "Install it now with the official installer (curl -fsSL https://bun.sh/install | bash)? [Y/n] " YN
    case "${YN:-y}" in
      [Yy]*) curl -fsSL https://bun.sh/install | bash < /dev/null ;;
      *) die "install bun from https://bun.sh and re-run" ;;
    esac
    # The bun installer puts it in ~/.bun/bin and edits your shell profile,
    # which this shell hasn't reloaded. Reach it directly for this run.
    export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
    export PATH="$BUN_INSTALL/bin:$PATH"
    command -v bun >/dev/null || die "bun installed but not on PATH yet. Open a new terminal and re-run."
  else
    die "install bun from https://bun.sh and re-run"
  fi
fi
note "bun $(bun --version)"

# ── 2. the name ───────────────────────────────────────────────────────────
slugify() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//'
}

NAME="${1:-}"
if [ -z "$NAME" ]; then
  [ "$HAVE_TTY" = 1 ] || die "no name given and no terminal to ask on. Usage: bash install.sh \"My Cool App\""
  echo
  ask "What's your app called? (e.g. My Cool App): " NAME
fi
NAME="$(printf '%s' "$NAME" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
[ -n "$NAME" ] || die "an app needs a name"

SLUG="$(slugify "$NAME")"
[ -n "$SLUG" ] || die "couldn't make a folder name out of '$NAME'. Use letters or digits."

if [ "$HAVE_TTY" = 1 ] && [ -z "${1:-}" ]; then
  echo "  Folder, package and database name: $SLUG"
  ask "  Press Enter to accept, or type a different one: " ALT
  if [ -n "$ALT" ]; then
    SLUG="$(slugify "$ALT")"
    [ -n "$SLUG" ] || die "couldn't make a folder name out of '$ALT'"
  fi
fi

[ ! -e "$SLUG" ] || die "'$SLUG' already exists here. Move it or pick another name."

# ── 3. clone ──────────────────────────────────────────────────────────────
# Shallow is fine: rename wipes the history anyway.
git clone --quiet --depth 1 "$REPO_URL" "$SLUG" || die "clone failed: $REPO_URL"
note "cloned aki into ./$SLUG"
cd "$SLUG"

# ── 4. make it yours ──────────────────────────────────────────────────────
bun install --silent
note "dependencies installed"

# --keep-example leaves the widgets CRUD resource in place. It's the reference
# implementation; a first app is easier to write beside a working one.
bun run --silent rename "$SLUG" --title "$NAME" --keep-example > /tmp/aki-rename.log 2>&1 \
  || { cat /tmp/aki-rename.log; die "rename failed"; }
if grep -q "still mentions aki" /tmp/aki-rename.log; then
  # Not fatal, but not something to hide either.
  sed -n '/still mentions aki/,/^$/p' /tmp/aki-rename.log
fi
note "renamed to \"$NAME\" ($SLUG)"

# rename removed aki's history. Give the app its own, if git knows who you are.
git init --quiet
git add -A
if git commit --quiet -m "New app from aki: $NAME" 2>/dev/null; then
  note "first commit made"
else
  note "git repo initialised (set git user.name / user.email, then commit)"
fi

# ── 5. build, then serve ──────────────────────────────────────────────────
# The first css:build fetches the Tailwind CLI, which is chatty. Log it instead.
bun run --silent css:build > /tmp/aki-css.log 2>&1 || { cat /tmp/aki-css.log; die "CSS build failed"; }
note "CSS built"

# The server takes PORT from the environment and defaults to 8787. Try that
# first; if something else has it, take any free one so this never fails on
# a machine that already runs an aki app.
#
# "Free" means nothing ANSWERS on it, on either loopback family. Trying to
# listen on 127.0.0.1 is not a test: macOS lets that succeed beside a server
# bound to the IPv6 wildcard, which is exactly what Bun.serve binds by default,
# so the first version of this handed out a port that was already taken.
#
# process.stdout.write, never console.log, and NO_COLOR for good measure: with a
# terminal attached Bun colours console.log numbers with ANSI escapes even when
# stdout is a pipe, so $PORT became "\e[33m8787\e[0m", which echoes fine and
# fails Number(). That was the "localhost:NaN" bug.
PORT="${AKI_PORT:-8787}"
PORT="$(NO_COLOR=1 bun -e '
const want = Number(process.argv[1]);
const answers = (hostname, port) => new Promise((resolve) => {
  let done = false;
  const finish = (v) => { if (!done) { done = true; resolve(v); } };
  Bun.connect({ hostname, port, socket: {
    open(sock) { sock.end(); finish(true); },
    data() {}, error() { finish(false); }, connectError() { finish(false); },
  } }).catch(() => finish(false));
  setTimeout(() => finish(false), 500);
});
const inUse = async (port) => (await answers("127.0.0.1", port)) || (await answers("::1", port));
const random = () => { const s = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } }); const p = s.port; s.stop(); return p; };
let port = want;
while (await inUse(port)) port = random();
process.stdout.write(`${port}\n`);
' "$PORT")"
case "$PORT" in *[!0-9]*|"") die "port probe returned '$PORT', not a number" ;; esac
[ -n "$PORT" ] && [ "$PORT" != "0" ] || die "couldn't find a free port"

cat <<EOF

$NAME is ready in ./$SLUG

  Open http://localhost:$PORT once the server says it's up.
    /          the welcome page
    /theme     every component, every theme, light and dark
    /widgets   the CRUD example to copy from

  Day to day (run these inside ./$SLUG):
    bun run dev              start the server with live reload
    bun run test             run the tests
    bun run check            format, regenerate COMPONENTS.md, test
    bun run db:generate      make a migration after editing db/schema.ts
    bun run db:migrate       apply it

  Ship it:
    bun run build:binary     one self-contained executable, no runtime needed
    bun run package:mac      a native Mac app and .dmg (see packaging/README.md)

  Make it yours:
    styles/tokens.css        your palette; this is what stops it looking generic
    assets/icon.svg          favicon + welcome image (package:mac makes the app icon from it)
    CLAUDE.md                the conventions, for you and for coding agents

EOF

if [ "${AKI_NO_SERVE:-0}" = "1" ]; then
  note "AKI_NO_SERVE=1: not starting the server"
  exit 0
fi

echo "Starting the dev server on port $PORT (Ctrl-C stops it; 'bun run dev' starts it again)."
echo
if [ "$HAVE_TTY" = 1 ]; then
  exec env PORT="$PORT" bun run dev < /dev/tty
fi
exec env PORT="$PORT" bun run dev
}

main "$@"
