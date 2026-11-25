#!/bin/bash
# Creates a self-signed code-signing identity ("SmartDemo Local Signing") in your login
# keychain, so local builds keep a stable signature and macOS remembers the Screen Recording,
# Camera and Microphone permissions across rebuilds. Run it once; build.sh picks it up.
#
# The private key never leaves your keychain. The certificate is only trusted for signing
# on this Mac: it is not a Developer ID and cannot be used to distribute the app.
set -euo pipefail
NAME="${1:-SmartDemo Local Signing}"
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"

if security find-certificate -c "$NAME" "$KEYCHAIN" >/dev/null 2>&1; then
  echo "✅ \"$NAME\" already exists."
  exit 0
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
umask 077
cat > "$TMP/cert.cnf" <<CNF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = $NAME
[ext]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
CNF

/usr/bin/openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -config "$TMP/cert.cnf" \
  -keyout "$TMP/key.pem" -out "$TMP/cert.pem" 2>/dev/null
PASS=$(/usr/bin/openssl rand -hex 16)
/usr/bin/openssl pkcs12 -export -inkey "$TMP/key.pem" -in "$TMP/cert.pem" -name "$NAME" \
  -out "$TMP/identity.p12" -passout "pass:$PASS" 2>/dev/null
security import "$TMP/identity.p12" -k "$KEYCHAIN" -P "$PASS" -T /usr/bin/codesign

echo "✅ Created \"$NAME\". The first build may ask to let codesign use the key: choose Always Allow."
