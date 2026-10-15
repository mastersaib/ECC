#!/usr/bin/env bash
# Create the one signing key every Galley release build uses.
#
# Run this once, on your own computer (it needs a JDK for keytool), then:
#   1. Keep galley-release.p12 and the password in two safe offline places.
#      Losing them means future builds cannot update the installed app.
#   2. Add four repository secrets (GitHub > Settings > Secrets and variables
#      > Actions): GALLEY_KEYSTORE_BASE64, GALLEY_KEYSTORE_PASSWORD,
#      GALLEY_KEY_ALIAS and GALLEY_KEY_PASSWORD. This script prints the base64.
#
# Never commit the .p12 file or the password.
set -euo pipefail

OUT="${1:-galley-release.p12}"
ALIAS="galley"

if [ -e "$OUT" ]; then
  echo "$OUT already exists. Refusing to overwrite a signing key." >&2
  exit 1
fi

read -r -s -p "Choose a keystore password (at least 12 characters): " PASSWORD
echo
if [ "${#PASSWORD}" -lt 12 ]; then
  echo "The password is too short." >&2
  exit 1
fi

keytool -genkeypair \
  -keystore "$OUT" -storetype PKCS12 \
  -alias "$ALIAS" -keyalg RSA -keysize 4096 -validity 10950 \
  -storepass "$PASSWORD" -keypass "$PASSWORD" \
  -dname "CN=Galley Proofreader"

echo
echo "Created $OUT (valid for 30 years). Add these GitHub secrets:"
echo "  GALLEY_KEY_ALIAS          $ALIAS"
echo "  GALLEY_KEYSTORE_PASSWORD  (the password you just typed)"
echo "  GALLEY_KEY_PASSWORD       (the same password)"
echo "  GALLEY_KEYSTORE_BASE64    (the text below, on one line)"
echo
base64 < "$OUT" | tr -d '\n'
echo
echo
echo "SHA-256 fingerprint (needed if you register the app for developer verification):"
keytool -list -keystore "$OUT" -storetype PKCS12 -storepass "$PASSWORD" -alias "$ALIAS" | grep -i 'SHA-256' || true
