#!/bin/bash
# Builds SmartDemo.app from the Swift package.
#
#   ./build.sh            → build/SmartDemo.app
#   ./build.sh --install  → also copies it to ~/Applications
#
# Signing: macOS ties Screen Recording / Camera / Microphone permissions to the app's code
# signature. With an ad-hoc signature every rebuild looks like a new app and permissions are
# lost. Run scripts/create-signing-cert.sh once to get a stable local identity, or point
# SMARTDEMO_SIGN_IDENTITY at any code-signing identity in your keychain.
set -euo pipefail
cd "$(dirname "$0")"

BUNDLE_ID="app.smartdemo.recorder"
IDENTITY_NAME="${SMARTDEMO_SIGN_IDENTITY:-SmartDemo Local Signing}"
APP="build/SmartDemo.app"

swift build -c release

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp .build/release/SmartDemo "$APP/Contents/MacOS/SmartDemo"
cp Resources/Info.plist "$APP/Contents/Info.plist"
cp Resources/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"

IDENTITY=$(security find-identity -p codesigning 2>/dev/null | awk -v n="\"$IDENTITY_NAME\"" 'index($0, n) {print $2; exit}')
if [[ -n "$IDENTITY" ]]; then
  codesign --force --sign "$IDENTITY" --identifier "$BUNDLE_ID" "$APP"
  echo "🔏 Signed with \"$IDENTITY_NAME\""
else
  codesign --force --sign - --identifier "$BUNDLE_ID" "$APP"
  echo "⚠️  Ad-hoc signature: macOS will ask for permissions again after each rebuild."
  echo "   Run scripts/create-signing-cert.sh once to fix that."
fi
echo "✅ Built $APP"

if [[ "${1:-}" == "--install" ]]; then
  mkdir -p "$HOME/Applications"
  rm -rf "$HOME/Applications/SmartDemo.app"
  cp -R "$APP" "$HOME/Applications/SmartDemo.app"
  echo "✅ Installed to ~/Applications/SmartDemo.app"
fi
