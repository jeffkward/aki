#!/usr/bin/env bash
# Builds <Name>.app and <Name>.dmg from the compiled server, optionally signed, notarized and stapled.
#
#   ./scripts/package-mac.sh                 # unsigned, for local testing
#   SIGN_ID="Developer ID Application: Your Name (TEAMID)" \
#   NOTARY_PROFILE=aki-notary \
#     ./scripts/package-mac.sh               # signed + notarized + stapled
#
# Requires a **Developer ID Application** certificate. An "Apple Development"
# certificate CANNOT sign for distribution and CANNOT be notarized — create the
# Developer ID one at developer.apple.com → Certificates (Account Holder role).
#
# One-time notary credential setup:
#   xcrun notarytool store-credentials aki-notary \
#     --apple-id you@example.com --team-id TEAMID --password <app-specific-password>
# (app-specific password from appleid.apple.com, NOT your Apple ID password)
set -euo pipefail
cd "$(dirname "$0")/.."

# Single-quoted, on its own line, on purpose: bash 3.2 (macOS's) treats a ' inside
# "${VAR:-default}" as a quote, so a name like Tom's Kanban inlined there broke
# the whole script at the first stray parenthesis, 70 lines later.
APP_NAME_DEFAULT='Aki'
APP_NAME="${APP_NAME:-$APP_NAME_DEFAULT}"
EXEC_NAME="${EXEC_NAME:-aki}"
BUNDLE_ID="${BUNDLE_ID:-com.example.aki}"
VERSION="${VERSION:-$(bun -e 'console.log(require("./package.json").version)')}"
ARCH="${ARCH:-bun-darwin-arm64}"
OUT=dist
APP="$OUT/$APP_NAME.app"
DMG="$OUT/$APP_NAME-$VERSION.dmg"

bun run css:build >/dev/null

if [ "${UNIVERSAL:-}" = "1" ]; then
  # A single-arch build simply will not launch on the other kind of Mac, so
  # anything you actually distribute should be universal.
  echo "▸ building binary (universal: arm64 + x86_64)"
  bun run scripts/build-binary.ts bun-darwin-arm64 >/dev/null
  mv dist/aki dist/aki-arm64
  bun run scripts/build-binary.ts bun-darwin-x64 >/dev/null
  mv dist/aki dist/aki-x64
  lipo -create dist/aki-arm64 dist/aki-x64 -output dist/aki
  rm -f dist/aki-arm64 dist/aki-x64
else
  echo "▸ building binary ($ARCH)  — set UNIVERSAL=1 to ship to Intel Macs too"
  bun run scripts/build-binary.ts "$ARCH" >/dev/null
fi

echo "▸ icon"
[ -f assets/aki.icns ] || ./scripts/make-icns.sh

echo "▸ native shell (Swift + system WebKit)"
# The bundle's executable is a real NSApplication so the app gets a window, a
# dock icon and a working Cmd-Q. The Bun server runs as its child at
# Contents/MacOS/server. ~90 KB, because WKWebView ships with macOS.
if [ "${UNIVERSAL:-}" = "1" ]; then
  swiftc -O -target arm64-apple-macos13  -o "dist/shell-arm64" shell/main.swift -framework Cocoa -framework WebKit
  swiftc -O -target x86_64-apple-macos13 -o "dist/shell-x64"   shell/main.swift -framework Cocoa -framework WebKit
  lipo -create "dist/shell-arm64" "dist/shell-x64" -output "dist/$EXEC_NAME-shell"
  rm -f "dist/shell-arm64" "dist/shell-x64"
else
  swiftc -O -o "dist/$EXEC_NAME-shell" shell/main.swift -framework Cocoa -framework WebKit
fi

echo "▸ $APP"
rm -rf "$APP" "$DMG"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "dist/$EXEC_NAME-shell" "$APP/Contents/MacOS/$EXEC_NAME"
cp dist/aki "$APP/Contents/MacOS/server"
cp assets/aki.icns "$APP/Contents/Resources/icon.icns"
# The name goes in with plutil, not sed: it may contain ', &, / or " and
# plutil takes any of them; a sed replacement does not.
sed -e "s/__BUNDLE_ID__/$BUNDLE_ID/g" -e "s/__EXEC__/$EXEC_NAME/g" -e "s/__VERSION__/$VERSION/g" \
    packaging/Info.plist > "$APP/Contents/Info.plist"
plutil -replace CFBundleName        -string "$APP_NAME" "$APP/Contents/Info.plist"
plutil -replace CFBundleDisplayName -string "$APP_NAME" "$APP/Contents/Info.plist"

# Optional build-time settings → Info.plist. Each is overridable at run time
# with `defaults write $BUNDLE_ID <Key> ...`, so this only sets the shipped
# default. See packaging/README.md for the full key list.
# NOTE the explicit `return 0`: with `set -e`, a function whose last command is
# a failed test aborts the whole script. An unset optional setting must not kill
# the build — that silently skipped the dmg step until it was caught.
plist_set() {
  [ -n "$2" ] || return 0
  plutil -replace "$1" -string "$2" "$APP/Contents/Info.plist"
}
plist_set WindowWidth           "${WINDOW_WIDTH:-}"
plist_set WindowHeight          "${WINDOW_HEIGHT:-}"
plist_set WindowMinWidth        "${WINDOW_MIN_WIDTH:-}"
plist_set WindowMinHeight       "${WINDOW_MIN_HEIGHT:-}"
plist_set WindowTitle           "${WINDOW_TITLE:-}"
plist_set ServerPort            "${SERVER_PORT:-}"
plist_set StartFullScreen       "${START_FULLSCREEN:-}"
plist_set RestoreWindowFrame    "${RESTORE_WINDOW_FRAME:-}"
plist_set DevTools              "${DEV_TOOLS:-}"
plist_set StartupTimeoutSeconds "${STARTUP_TIMEOUT:-}"

if [ -n "${SIGN_ID:-}" ]; then
  echo "▸ codesign (inside-out: nested code first, then the bundle)"
  # --deep is discouraged by Apple and gets nested entitlements wrong. Sign the
  # embedded server FIRST — it is the one that needs the JIT entitlements,
  # because it is the Bun/JavaScriptCore binary.
  codesign --force --timestamp --options runtime \
    --entitlements packaging/entitlements.plist \
    --sign "$SIGN_ID" "$APP/Contents/MacOS/server"
  codesign --force --timestamp --options runtime \
    --entitlements packaging/entitlements.plist \
    --sign "$SIGN_ID" "$APP"
  codesign --verify --strict --deep --verbose=2 "$APP"
else
  echo "▸ codesign SKIPPED (no SIGN_ID) — Gatekeeper will refuse this on another Mac"
fi

echo "▸ $DMG"
hdiutil create -quiet -volname "$APP_NAME" -srcfolder "$APP" -ov -format UDZO "$DMG"

if [ -n "${SIGN_ID:-}" ]; then
  codesign --force --timestamp --sign "$SIGN_ID" "$DMG"
fi

if [ -n "${NOTARY_PROFILE:-}" ]; then
  echo "▸ notarize (this takes a few minutes)"
  xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE" --wait
  echo "▸ staple"
  xcrun stapler staple "$DMG"
  xcrun stapler validate "$DMG"
  spctl -a -t open --context context:primary-signature -v "$DMG" || true
else
  echo "▸ notarize SKIPPED (no NOTARY_PROFILE)"
fi

echo
echo "✓ $APP"
echo "✓ $DMG  ($(du -h "$DMG" | cut -f1))"
echo "  architectures: $(lipo -archs "$APP/Contents/MacOS/server")"
