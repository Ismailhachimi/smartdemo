#!/bin/bash
# Regenerates the app icon: scripts/make-icon.swift → docs/images/icon.png → Resources/AppIcon.icns
set -euo pipefail
cd "$(dirname "$0")/.."
PNG=docs/images/icon.png
SET=$(mktemp -d)/AppIcon.iconset
mkdir -p "$SET"
swift scripts/make-icon.swift "$PNG"
for s in 16 32 128 256 512; do
  sips -z $s $s "$PNG" --out "$SET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) "$PNG" --out "$SET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$SET" -o Resources/AppIcon.icns
rm -rf "$(dirname "$SET")"
echo "✅ Resources/AppIcon.icns"
