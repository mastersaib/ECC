#!/usr/bin/env bash
# Create the one signing key every Galley release build uses.
#
# Run this once, on your own computer (it needs a JDK for keytool), then:
#   1. Keep galley-release.p12 and the password in two safe offline places.
#      Losing them means future builds cannot update the installed app.
#   2. Add four repository secrets (GitHub > Settings > Secrets and variables
#      > Actions): GALLEY_KEYSTORE_BASE64, GALLEY_KEYSTORE_PASSWORD,
#      GALLEY_KEY_ALIAS and GALLEY_KEY_PASSWORD. This script prints the base64.
#   3. Optionally add the repository variable GALLEY_CERT_SHA256 (same page,
#      Variables tab) so CI refuses builds signed with any other key.
#
# The key is written outside the repository (default: ~/galley-release.p12)
# so it can never be committed by accident.
set -euo pipefail

OUT="${1:-$HOME/galley-release.p12}"
ALIAS="galley"

if [ -e "$OUT" ]; then
  echo "$OUT already exists. Refusing to overwrite a signing key." >&2
  exit 1
fi
DIR=$(cd "$(dirname "$OUT")" && pwd)
if git -C "$DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "$DIR is inside a git repository, where the key could be committed by accident." >&2
  echo "Choose a path outside it, for example: $0 \"\$HOME/galley-release.p12\"" >&2
  exit 1
fi

read -r -s -p "Choose a keystore password (at least 12 characters): " PASSWORD
echo
if [ "${#PASSWORD}" -lt 12 ]; then
  echo "The password is too short." >&2
  exit 1
fi

# Pass the password through the environment, not the command line, so it
# does not show up in the process list.
export GALLEY_KEYTOOL_PASSWORD="$PASSWORD"
keytool -genkeypair \
  -keystore "$OUT" -storetype PKCS12 \
  -alias "$ALIAS" -keyalg RSA -keysize 4096 -validity 10950 \
  -storepass:env GALLEY_KEYTOOL_PASSWORD -keypass:env GALLEY_KEYTOOL_PASSWORD \
  -dname "CN=Galley Proofreader"
FINGERPRINT=$(keytool -list -v -keystore "$OUT" -storetype PKCS12 -storepass:env GALLEY_KEYTOOL_PASSWORD -alias "$ALIAS" \
  | awk '/SHA256:/ { print $2; exit }')
unset GALLEY_KEYTOOL_PASSWORD

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
echo "And this repository variable (also needed for Play or developer verification):"
echo "  GALLEY_CERT_SHA256        $FINGERPRINT"
