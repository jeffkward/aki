#!/usr/bin/env bash
# assets/icon.svg → assets/aki.icns  (macOS app icon)
# Requires: rsvg-convert (brew install librsvg) and iconutil (ships with macOS).
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=assets/icon.svg
SET=assets/aki.iconset
rm -rf "$SET" && mkdir -p "$SET"
# macOS wants each size at 1x and 2x.
for s in 16 32 128 256 512; do
  rsvg-convert -w $s        -h $s        "$SRC" -o "$SET/icon_${s}x${s}.png"
  rsvg-convert -w $((s*2))  -h $((s*2))  "$SRC" -o "$SET/icon_${s}x${s}@2x.png"
done
iconutil -c icns "$SET" -o assets/aki.icns
rm -rf "$SET"
echo "assets/aki.icns ← $SRC"
