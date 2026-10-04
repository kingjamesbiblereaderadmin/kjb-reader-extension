#!/usr/bin/env bash
# Publish a KJB Reader firefox package to addons.mozilla.org (AMO) via the
# AMO Add-ons API v5, authenticating with the account's API key
# (JWT issuer + secret, from https://addons.mozilla.org/developers/addon/api/key/).
#
# Flow (per AMO docs):
#   1. Sign a short-lived HS256 JWT with the API key.
#   2. POST the zip to /api/v5/addons/upload/   -> upload uuid + validation
#   3. PUT  /api/v5/addons/addon/<slug>/versions/<version>/  {"upload": uuid}
#      to attach the package to the listing. The attached version goes to
#      review and publishes automatically once approved (listed channel).
#
# AMO consumes a version number permanently once submitted (even on
# rejection), so only run this after build.sh has produced a fresh version.
#
# Usage:
#   publish-firefox.sh <extension.zip>            # upload + validate only
#   publish-firefox.sh <extension.zip> --attach   # also attach to the listing
#
# Environment:
#   AMO_JWT_ISSUER   Required — API key ID (the "JWT issuer" string)
#   AMO_JWT_SECRET   Required — API key secret (the "JWT secret" string)
#   AMO_ADDON_SLUG   Optional; defaults to KJB Reader's slug
set -euo pipefail

API_ROOT="https://addons.mozilla.org/api/v5"
DEFAULT_ADDON_SLUG="kjb-reader-sidepanel"

if [[ -f /app/.agents/.env ]]; then
  _I="${AMO_JWT_ISSUER:-}"; _S="${AMO_JWT_SECRET:-}"
  set -a
  # shellcheck disable=SC1091
  source /app/.agents/.env
  set +a
  [[ -n "$_I" ]] && AMO_JWT_ISSUER="$_I"
  [[ -n "$_S" ]] && AMO_JWT_SECRET="$_S"
fi

ADDON_SLUG="${AMO_ADDON_SLUG:-$DEFAULT_ADDON_SLUG}"
ATTACH=false
ZIP_FILE=""

usage() {
  cat <<'EOF'
Usage:
  publish-firefox.sh <extension.zip>
  publish-firefox.sh <extension.zip> --attach

Options:
  --attach   Attach the uploaded package to the addon listing for review.
             Without it, the package is only uploaded and validated.

Environment:
  AMO_JWT_ISSUER   Required — the API key "JWT issuer" value
  AMO_JWT_SECRET   Required — the API key "JWT secret" value
  AMO_ADDON_SLUG   Optional; defaults to KJB Reader's slug
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --attach)
      ATTACH=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo "Error: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      [[ -z "$ZIP_FILE" ]] || { echo "Error: only one ZIP package may be supplied." >&2; exit 2; }
      ZIP_FILE="$1"
      shift
      ;;
  esac
done

[[ -n "$ZIP_FILE" ]] || { echo "Error: extension ZIP is required." >&2; usage >&2; exit 2; }
[[ -f "$ZIP_FILE" ]] || { echo "Error: ZIP not found: $ZIP_FILE" >&2; exit 2; }
[[ -n "${AMO_JWT_ISSUER:-}" && -n "${AMO_JWT_SECRET:-}" ]] || {
  echo "Error: AMO_JWT_ISSUER and AMO_JWT_SECRET are required." >&2
  exit 2
}

# --- sign a short-lived JWT (HS256) with the API key -----------------------
sign_jwt() {
  python3 - "$AMO_JWT_ISSUER" "$AMO_JWT_SECRET" <<'PY'
import base64, hashlib, hmac, json, os, sys, time

issuer, secret = sys.argv[1], sys.argv[2]
header = {"alg": "HS256", "typ": "JWT"}
now = int(time.time())
payload = {"iss": issuer, "jti": base64.urlsafe_b64encode(os.urandom(16)).decode().rstrip("="),
           "iat": now, "exp": now + 300}

def b64(obj):
    return base64.urlsafe_b64encode(json.dumps(obj, separators=(",", ":")).encode()).decode().rstrip("=")

msg = f"{b64(header)}.{b64(payload)}"
sig = base64.urlsafe_b64encode(hmac.new(secret.encode(), msg.encode(), hashlib.sha256).digest()).decode().rstrip("=")
print(f"{msg}.{sig}")
PY
}

auth_headers() {
  # AMO (olympia) requires the literal "JWT " prefix in the header.
  echo "Authorization: JWT $(sign_jwt)"
}

MANIFEST_VERSION="$(unzip -p "$ZIP_FILE" manifest.json 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("version","?"))' || echo '?')"
echo "Package: $ZIP_FILE"
echo "Manifest version: $MANIFEST_VERSION"
echo "AMO addon slug: $ADDON_SLUG"
echo

echo "Uploading package to AMO..."
UPLOAD_JSON="$(curl -sS --fail-with-body -X POST "$API_ROOT/addons/upload/" \
    -H "$(auth_headers)" \
    -F "upload=@$ZIP_FILE;type=application/zip" \
    -F "channel=listed")"
echo "Upload response: $UPLOAD_JSON"
UPLOAD_UUID="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["uuid"])' <<<"$UPLOAD_JSON")"
CHANNEL="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("channel",""))' <<<"$UPLOAD_JSON")"
echo "Uploaded. uuid: $UPLOAD_UUID | channel: ${CHANNEL:-listed}"
echo

echo "Checking validation..."
for _ in $(seq 1 12); do
  DETAIL="$(curl -sS --fail-with-body "$API_ROOT/addons/upload/$UPLOAD_UUID/" -H "$(auth_headers)")"
  PROCESSED="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("processed", False))' <<<"$DETAIL")"
  VALID="$(python3 -c 'import json,sys; d=json.load(sys.stdin); v=d.get("validation") or {}; print(d.get("valid", v.get("success", "?")))' <<<"$DETAIL")"
  if [[ "$PROCESSED" == "True" ]]; then
    if [[ "$VALID" != "True" ]]; then
      echo "Validation FAILED:" >&2
      python3 -m json.tool <<<"$DETAIL" >&2
      exit 3
    fi
    echo "Validation: SUCCEEDED"
    break
  fi
  sleep 5
done
if [[ "$PROCESSED" != "True" ]]; then
  echo "Timed out waiting for AMO validation." >&2
  exit 4
fi

if [[ "$ATTACH" != true ]]; then
  echo "Uploaded and validated, but NOT attached to the listing."
  echo "Re-run with --attach to submit it for AMO review."
  exit 0
fi

echo
echo "Attaching $MANIFEST_VERSION to addon '$ADDON_SLUG' for review..."
RESULT="$(curl -sS --fail-with-body -X POST \
  "$API_ROOT/addons/addon/$ADDON_SLUG/versions/" \
  -H "$(auth_headers)" -H "Content-Type: application/json" \
  -d "{\"upload\": \"$UPLOAD_UUID\"}")"
echo "Attach response: $RESULT"
echo
echo "AMO accepted $MANIFEST_VERSION. It is now in the review queue and"
echo "publishes automatically once approved."
