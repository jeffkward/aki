#!/usr/bin/env bash
# assets/icon.svg → assets/aki.icns  (macOS app icon)
#
# Renders with rsvg-convert (brew install librsvg) when it is there, and with
# qlmanage, macOS's own QuickLook renderer, when it is not. A fresh Mac has no
# Homebrew, and the whole point of the desktop build is that it needs nothing
# installed; the icon step must not be the exception. iconutil ships with macOS.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=assets/icon.svg
SET=assets/aki.iconset
rm -rf "$SET" && mkdir -p "$SET"

render() {  # render <size> <out.png>
  if command -v rsvg-convert >/dev/null; then
    rsvg-convert -w "$1" -h "$1" "$SRC" -o "$2"
  else
    # qlmanage writes <basename>.svg.png into the directory given by -o.
    local tmp
    tmp="$(mktemp -d)"
    qlmanage -t -s "$1" -o "$tmp" "$SRC" >/dev/null 2>&1
    [ -f "$tmp/$(basename "$SRC").png" ] || { echo "make-icns: qlmanage could not render $SRC" >&2; exit 1; }
    mv "$tmp/$(basename "$SRC").png" "$2"
    rm -rf "$tmp"
  fi
}

# macOS wants each size at 1x and 2x.
for s in 16 32 128 256 512; do
  render "$s"        "$SET/icon_${s}x${s}.png"
  render "$((s*2))"  "$SET/icon_${s}x${s}@2x.png"
done
iconutil -c icns "$SET" -o assets/aki.icns
rm -rf "$SET"
echo "assets/aki.icns ← $SRC  ($(command -v rsvg-convert >/dev/null && echo rsvg-convert || echo qlmanage))"
