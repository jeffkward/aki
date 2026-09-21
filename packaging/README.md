# Shipping aki as a desktop app

Your app, as a `.dmg` someone double-clicks. They install **nothing** — no Bun, no Node,
no database. What it costs you is one Apple certificate and about a day of first-time
setup misery, most of it Apple's fault.

**Short version:**

```bash
UNIVERSAL=1 ./scripts/package-mac.sh                      # local test build
SIGN_ID="Developer ID Application: You (TEAMID)" \
NOTARY_PROFILE=aki-notary UNIVERSAL=1 ./scripts/package-mac.sh   # the real thing
```

Read the certificate section first — without the right one, nothing else matters.

Two paths. **Path A works today** and is what `scripts/package-mac.sh` builds.
**Path B (Tauri)** gives a real native window and is the upgrade when you want one.

---

## ⚠️ First: the certificate

`security find-identity -v -p codesigning` probably shows **"Apple Development: …"**.
That is **not** enough. It signs builds for your own devices only — it cannot be
notarized, and Gatekeeper rejects it on anyone else's Mac. Verified here:

```
$ spctl -a -vv dist/Aki.app
dist/Aki.app: rejected
origin=Apple Development: Your Name (TEAMID)
```

You need a **Developer ID Application** certificate:

1. developer.apple.com → Certificates, Identifiers & Profiles → Certificates → **+**
2. Choose **Developer ID Application** (requires the **Account Holder** role)
3. Create a CSR in Keychain Access → Certificate Assistant → Request a Certificate
   from a Certificate Authority → *Saved to disk*
4. Download and double-click the issued cert to install it

Then one-time notary credentials:

```bash
xcrun notarytool store-credentials aki-notary \
  --apple-id you@example.com --team-id TEAMID \
  --password <app-specific-password>      # appleid.apple.com, NOT your Apple ID password
```

---

## Path A — native window, Swift + system WebKit  (what `package:mac` builds)

```bash
# local test build, unsigned
./scripts/package-mac.sh

# the real thing
SIGN_ID="Developer ID Application: Your Name (TEAMID)" \
NOTARY_PROFILE=aki-notary \
  ./scripts/package-mac.sh
```

Produces `dist/Aki.app` and `dist/Aki-<version>.dmg` (~26 MB compressed, 60 MB binary).

**How it works.** Two executables in one bundle:

```
Aki.app/Contents/MacOS/aki       ~90 KB   the Swift shell — a real NSApplication
Aki.app/Contents/MacOS/server     60 MB   the compiled Bun binary, run as its child
```

`shell/main.swift` (~150 lines) creates an `NSWindow` with a `WKWebView`, asks the kernel
for a free port, spawns the server on it, waits for it to answer, and points the WebView
at it. Because WKWebView ships with macOS there is nothing to bundle — **no Electron, no
second JavaScript runtime, and no Rust toolchain.** You get a real window, a dock icon,
a menu bar, working ⌘Q and ⌘C/⌘V, and remembered window size.

**Two things the script encodes that are easy to get wrong:**

- **JIT entitlements.** Bun runs JavaScriptCore, which JITs. Under a hardened runtime
  (required for notarization) an unentitled build *crashes on launch on another Mac*.
  `packaging/entitlements.plist` grants `com.apple.security.cs.allow-jit` and
  `com.apple.security.cs.allow-unsigned-executable-memory`. Verify with
  `codesign -d --entitlements - dist/Aki.app`.
- **Data location.** A `.app` is read-only and launches with `/` as its working
  directory, so nothing may be written beside the binary. `app/lib/paths.ts` puts the
  database in `~/Library/Application Support/aki/`.

**Making sure the server exits when the shell does is the part that needs care**, and it took three tries:

1. `applicationWillTerminate` only fires on a *Cocoa* quit (⌘Q, the menu). A plain `kill`
   stopped the shell and **orphaned the server**, still holding the database.
   → `DispatchSource` signal handlers for SIGTERM/SIGINT/SIGHUP.
2. A crash (`kill -9`) runs no handler at all.
   → the server watches its parent and exits when it disappears.
3. That watchdog first used `process.ppid` — and **Bun caches `process.ppid` at
   startup**, so after the parent died it kept reporting the dead pid while the real
   ppid was 1. (Node's is a live getter; Bun's is not.)
   → the shell passes `AKI_PARENT_PID`, and the server probes it with
   `process.kill(pid, 0)`.

Both paths are verified: SIGTERM and SIGKILL each leave no orphan.

**What this path does not give you:** Windows and Linux (it's Cocoa), and an auto-updater.

---

## Path B — Tauri with the binary as a sidecar  (cross-platform)

The reason to move here is **not** the window — Path A already has one. It's
**Windows and Linux from the same shell**, plus a signed auto-updater and a
maintained bundler. Costs a Rust toolchain and a second build system.

```bash
# 1. toolchain (not currently installed on this machine)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. scaffold alongside the existing app
bun add -d @tauri-apps/cli
bunx tauri init      # frontend dist: ../public   dev server: http://localhost:8787

# 3. build the aki binary as the sidecar, named with the Rust target triple
bun run scripts/build-binary.ts bun-darwin-arm64
mkdir -p src-tauri/binaries
cp dist/aki src-tauri/binaries/aki-aarch64-apple-darwin

# 4. build the app
bunx tauri build
```

`src-tauri/tauri.conf.json` — the parts that matter (stub in `packaging/tauri.conf.stub.json`):

```jsonc
{
  "bundle": {
    "active": true,
    "targets": ["dmg", "app"],
    "icon": ["assets/aki.icns"],
    "externalBin": ["binaries/aki"],        // ← the sidecar; Tauri appends the target triple
    "macOS": { "minimumSystemVersion": "13.0", "entitlements": "../packaging/entitlements.plist" }
  },
  "app": { "windows": [{ "title": "aki", "width": 1100, "height": 800, "url": "http://localhost:8787" }] }
}
```

Then in `src-tauri/src/main.rs`, spawn the sidecar on startup and stop it on exit
(`tauri_plugin_shell`'s `.sidecar("aki")`), pointing the window at the local server.

Tauri's CLI handles signing and notarization itself via
`APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` and `APPLE_TEAM_ID` —
the same Developer ID certificate is still the prerequisite.

**Why not Electron:** it would work, and `electron-builder` is the most mature installer
tooling there is — but it ships a second JavaScript runtime (~150 MB baseline) next to
the one already inside the aki binary. Tauri uses the system WebView instead. If you
ever need Windows installers in a hurry and Tauri is fighting you, Electron is the
pragmatic fallback, not a mistake.

---

## What the user needs installed

**Nothing.** Not Bun, not Node, not a database. `bun build --compile` puts the Bun
runtime inside the binary; verified with `otool -L`, which shows the server linking
against four system dylibs and nothing else:

```
/usr/lib/libicucore.A.dylib   /usr/lib/libresolv.9.dylib
/usr/lib/libc++.1.dylib       /usr/lib/libSystem.B.dylib
```

...and by running it with `bun` absent from `PATH` in a scrubbed environment. It serves.

What they **do** need:

| | |
|---|---|
| **macOS 13.0+** | `LSMinimumSystemVersion`. Raise it in `packaging/Info.plist` if you use newer APIs — and actually compile against your stated floor, or the plist is a guess |
| **The right architecture** | a single-arch build **will not launch** on the other kind of Mac |

### Build universal, always, for anything you distribute

```bash
UNIVERSAL=1 ./scripts/package-mac.sh
```

Builds the server for `bun-darwin-arm64` *and* `bun-darwin-x64`, does the same for the
Swift shell with explicit `-target` flags, and `lipo`s each pair together. 52 MB dmg
instead of 26 MB. The script prints the architectures at the end — check that line.

## Settings

Resolved last-wins: **built-in defaults → `Info.plist` (build time) → `UserDefaults`
(run time)**. So you can retune a built app without rebuilding it:

```bash
defaults write com.example.aki WindowWidth -int 1400     # change
defaults delete com.example.aki WindowWidth              # back to the default
```

and set shipped defaults at build time:

```bash
WINDOW_WIDTH=1280 WINDOW_HEIGHT=900 DEV_TOOLS=false ./scripts/package-mac.sh
```

| Key | Build-time env | Default | What it does |
|---|---|---|---|
| `WindowWidth` | `WINDOW_WIDTH` | 1000 | initial window width |
| `WindowHeight` | `WINDOW_HEIGHT` | 900 | initial window height |
| `WindowMinWidth` | `WINDOW_MIN_WIDTH` | 640 | minimum width |
| `WindowMinHeight` | `WINDOW_MIN_HEIGHT` | 480 | minimum height |
| `WindowTitle` | `WINDOW_TITLE` | `CFBundleName` | title bar text |
| `RestoreWindowFrame` | `RESTORE_WINDOW_FRAME` | `true` | remember size/position between launches |
| `StartFullScreen` | `START_FULLSCREEN` | `false` | open full screen |
| `ServerPort` | `SERVER_PORT` | `0` | `0` = ask the kernel for a free one (avoids collisions) |
| `StartupTimeoutSeconds` | `STARTUP_TIMEOUT` | 20 | how long to wait for the server before giving up |
| `DevTools` | `DEV_TOOLS` | `true` | right-click → Inspect Element. **Set `false` for release** |
| `OpenExternalLinksInBrowser` | — | `true` | external links open in the real browser, not in the app |

⚠️ **`RestoreWindowFrame` beats `WindowWidth`.** Once a window has been moved or resized,
macOS restores the saved frame and your new `WindowWidth` appears to do nothing. That is
working as intended — clear it with
`defaults delete com.example.aki "NSWindow Frame main"`, or set
`RestoreWindowFrame=false`.

The server also reads `PORT`, `AKI_DB`, `AKI_NO_OPEN` and `AKI_PARENT_PID` from the
environment; the shell sets the last three itself.

## The app icon

**Source of truth:** `assets/icon.svg` — one 1024×1024 SVG. Everything else is generated.

```bash
bun run icon        # assets/icon.svg → assets/aki.icns
```

`scripts/make-icns.sh` rasterises with `rsvg-convert` (`brew install librsvg`) and packs
with `iconutil`, which ships with macOS.

### Specs

| | |
|---|---|
| Canvas | **1024 × 1024**, square, `viewBox="0 0 1024 1024"` |
| Sizes generated | 16, 32, 128, 256, 512 — each at **1x and 2x** (10 PNGs) |
| Format in the bundle | `.icns` at `Contents/Resources/icon.icns`, named by `CFBundleIconFile` |
| Colour | sRGB. No colour profile needed |
| Transparency | allowed, but the shape should be opaque — see below |
| Windows | a `.ico` via `windows: { icon }` in `scripts/build-binary.ts` |
| In-app | the same SVG is served at `/icon.svg` and used on the welcome page |

### ⚠️ The geometry is a measured standard, not a guess

Two things to get right, and the second is the one that trips everyone.

**1. macOS does not round your icon for you.** Unlike iOS, it renders exactly what you
draw. Supply a bare square and you get a bare square in the dock. The rounded shape has
to be in the SVG.

**2. The shape does NOT fill the canvas.** Stock icons follow one standard — measured
here off `Notes.app` and `Music.app`, which come out identical:

| | |
|---|---|
| shape | **79.7%** of the 1024 canvas → 816 px, inset 104 px |
| corner inset | **12.3%** of the shape width |

That 104 px border is **not wasted space** — it is the shadow room every stock icon
leaves, and matching it is what makes your icon sit at the same size as its neighbours.

An icon that fills the canvas edge-to-edge renders ~25% larger than everything around
it. Counter-intuitively, that is *not* what made an earlier version of this icon look
small: it covered **more** canvas than Notes does and still read as smaller, because its
corners were **26.2%** inset instead of 12.3%. Over-rounded corners read as a blob, and
a blob reads as small. **Corner radius, not footprint, is what makes an icon look like
it fills its tile.**

`assets/icon.svg` uses a circular-arc rounded rect at `r=175`, chosen because it
*measures* 12.3%. Apple's true shape is a superellipse with continuous curvature; the
difference is imperceptible at icon sizes and a compact, hand-editable path is worth
more than purity here.

**Measure, don't eyeball.** This checks any icon against the standard:

```bash
python3 - <<'EOF'
from PIL import Image
im = Image.open("/tmp/icon.png").convert("RGBA"); w,h = im.size
px = im.getchannel("A").load()
rows=[y for y in range(h) if any(px[x,y]>230 for x in range(w))]
cols=[x for x in range(w) if any(px[x,y]>230 for y in range(h))]
top,left,right = rows[0],cols[0],cols[-1]; sw=right-left+1
y=top+max(1,h//64); xs=[x for x in range(w) if px[x,y]>230]
print(f"shape {100*sw/w:.1f}% (target 79.7)  corner inset {100*(xs[0]-left)/sw:.1f}% (target 12.3)")
EOF
```

### Replacing it

1. Edit `assets/icon.svg` — keep the 1024 canvas and the clip path
2. `bun run icon`
3. `./scripts/package-mac.sh`

Render variants and compare them **at actual dock size, beside a real system icon**,
before committing. A composition that reads well at 512 px can be mush at 32 px, and
size/corner problems are invisible until something known sits next to them:

```bash
# extract a stock icon to compare against
iconutil -c iconset /System/Applications/Notes.app/Contents/Resources/*.icns -o /tmp/ref.iconset
rsvg-convert -w 256 -h 256 assets/icon.svg -o /tmp/mine.png
magick montage -label '%t' -tile 2x1 -geometry 80x80+16+10 \
  /tmp/ref.iconset/icon_128x128.png /tmp/mine.png /tmp/cmp.png && open /tmp/cmp.png
```

`killall Dock` after replacing an icon — macOS caches them hard.

## Current limitations

Honest list of what this does *not* do yet.

| | |
|---|---|
| **macOS only** | the shell is Cocoa. Windows and Linux need a cross-platform shell — see the roadmap |
| **No auto-update** | users re-download. There is no update channel, no delta updates, no rollback |
| **No native chrome beyond a window** | no tray icon, no notifications, no native file dialogs, no menu-bar app, no deep links. Anything the web page can't do, the app can't do |
| **One window** | no multi-window, no tabs |
| **Two instances share one database** | each picks its own port, but both open the same file. SQLite handles it safely; it may still not be what you want |
| **Unsigned builds are unusable by others** | Gatekeeper refuses them. This is a certificate problem, not a code problem |
| **~60 MB per architecture** | the Bun runtime is inside the binary. Universal builds double it |

## Roadmap

In the order we'd likely do them:

1. **Electron** — the planned cross-platform step. It brings Windows and Linux, the most
   mature installer tooling anywhere (`electron-builder`), a signed auto-updater, and
   lets shell work be written in JavaScript instead of Swift. The cost is a second
   JavaScript runtime (~150 MB) beside the one already inside the aki binary, which is
   why it isn't the *first* step — but it is the pragmatic one once more than macOS
   matters.
2. **Auto-update** — whichever shell we're on, this is the biggest real gap. Users on a
   stale version is the normal state of shipped desktop software.
3. **Single-instance enforcement** — focus the existing window instead of opening a
   second one on the same database.
4. **Windows installer** — needs an OV code-signing certificate (~$200–400/yr) or
   SmartScreen warns. Electron or Tauri both handle the MSI/NSIS part.

**Tauri** (documented above) remains the lighter alternative to Electron — a ~5 MB shell
instead of ~150 MB — at the cost of a Rust toolchain and writing shell code in Rust. If
Windows arrives before anyone wants to learn Rust, Electron is the answer.

## Windows

`scripts/build-binary.ts bun-windows-x64` cross-compiles from this Mac. The
`windows: { title, publisher, hideConsole }` options are already set — `hideConsole`
is what stops a terminal window appearing behind the app. Wrapping it in an installer
needs Inno Setup or WiX, and an **OV code-signing certificate** (~$200–400/yr) or
SmartScreen will warn. Tauri does MSI/NSIS for you if you go Path B.
