#!/usr/bin/env bash
set -euo pipefail

API_ROOT="https://chromewebstore.googleapis.com"
TOKEN_URL="https://oauth2.googleapis.com/token"
DEFAULT_ITEM_ID="gbnipepkpenjgdpjfepgcgddmgbofmah"

if [[ -f /app/.agents/.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source /app/.agents/.env
  set +a
fi

ITEM_ID="${CHROME_WEBSTORE_ITEM_ID:-$DEFAULT_ITEM_ID}"
PUBLISHER_ID="${CHROME_WEBSTORE_PUBLISHER_ID:-}"
POLL_SECONDS="${CHROME_WEBSTORE_POLL_SECONDS:-10}"
MAX_POLLS="${CHROME_WEBSTORE_MAX_POLLS:-60}"
SUBMIT=false
AUTO_PUBLISH=false
ZIP_FILE=""

usage() {
  cat <<'EOF'
Usage:
  publish-chrome.sh <extension.zip>
  publish-chrome.sh <extension.zip> --submit
  publish-chrome.sh <extension.zip> --submit --auto-publish

Default behavior uploads and validates a Chrome Web Store draft only.
--submit starts review using staged publishing: approval does not make it live.
--auto-publish additionally allows the approved revision to publish automatically.

Environment:
  CHROME_WEBSTORE_CLIENT_ID       Required OAuth client ID
  CHROME_WEBSTORE_CLIENT_SECRET   Required OAuth client secret
  CHROME_WEBSTORE_REFRESH_TOKEN   Required OAuth refresh token
  CHROME_WEBSTORE_PUBLISHER_ID    Required publisher ID from Dashboard > Settings
  CHROME_WEBSTORE_ITEM_ID         Optional; defaults to KJB Reader's store item ID
  CHROME_WEBSTORE_POLL_SECONDS    Upload poll interval (default: 10)
  CHROME_WEBSTORE_MAX_POLLS       Maximum upload status checks (default: 60)

Required OAuth scope:
  https://www.googleapis.com/auth/chromewebstore
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --submit)
      SUBMIT=true
      shift
      ;;
    --auto-publish)
      AUTO_PUBLISH=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -* )
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
[[ "$ZIP_FILE" == *.zip ]] || { echo "Error: package must be a .zip file." >&2; exit 2; }
[[ "$ITEM_ID" =~ ^[a-p]{32}$ ]] || { echo "Error: invalid Chrome Web Store item ID." >&2; exit 2; }
[[ -n "$PUBLISHER_ID" ]] || { echo "Error: CHROME_WEBSTORE_PUBLISHER_ID is not configured." >&2; exit 2; }
[[ -n "${CHROME_WEBSTORE_CLIENT_ID:-}" ]] || { echo "Error: CHROME_WEBSTORE_CLIENT_ID is not configured." >&2; exit 2; }
[[ -n "${CHROME_WEBSTORE_CLIENT_SECRET:-}" ]] || { echo "Error: CHROME_WEBSTORE_CLIENT_SECRET is not configured." >&2; exit 2; }
[[ -n "${CHROME_WEBSTORE_REFRESH_TOKEN:-}" ]] || { echo "Error: CHROME_WEBSTORE_REFRESH_TOKEN is not configured." >&2; exit 2; }
[[ "$POLL_SECONDS" =~ ^[1-9][0-9]*$ ]] || { echo "Error: CHROME_WEBSTORE_POLL_SECONDS must be a positive integer." >&2; exit 2; }
[[ "$MAX_POLLS" =~ ^[1-9][0-9]*$ ]] || { echo "Error: CHROME_WEBSTORE_MAX_POLLS must be a positive integer." >&2; exit 2; }

if $AUTO_PUBLISH && ! $SUBMIT; then
  echo "Error: --auto-publish requires --submit." >&2
  exit 2
fi

command -v curl >/dev/null || { echo "Error: curl is required." >&2; exit 2; }
command -v python3 >/dev/null || { echo "Error: python3 is required." >&2; exit 2; }
command -v unzip >/dev/null || { echo "Error: unzip is required." >&2; exit 2; }
unzip -tq "$ZIP_FILE" >/dev/null || { echo "Error: ZIP integrity check failed." >&2; exit 2; }

MANIFEST_VERSION="$(unzip -p "$ZIP_FILE" manifest.json | python3 -c 'import json,sys; print(json.load(sys.stdin).get("version", "unknown"))')"
[[ "$MANIFEST_VERSION" != "unknown" ]] || { echo "Error: manifest.json has no version." >&2; exit 2; }

echo "Package: $ZIP_FILE"
echo "Manifest version: $MANIFEST_VERSION"
echo "Chrome item ID: $ITEM_ID"
echo "Publisher ID: $PUBLISHER_ID"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

json_field() {
  local file="$1" path="$2"
  python3 - "$file" "$path" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    value = json.load(f)
for key in sys.argv[2].split("."):
    if not isinstance(value, dict) or key not in value:
        value = None
        break
    value = value[key]
if value is None:
    print("")
elif isinstance(value, (dict, list)):
    print(json.dumps(value, ensure_ascii=False))
else:
    print(value)
PY
}

print_api_error() {
  local file="$1"
  python3 - "$file" <<'PY'
import json, sys
try:
    with open(sys.argv[1], encoding="utf-8") as f:
        data = json.load(f)
    error = data.get("error", data)
    print(json.dumps(error, indent=2, ensure_ascii=False), file=sys.stderr)
except Exception:
    with open(sys.argv[1], encoding="utf-8", errors="replace") as f:
        print(f.read(), file=sys.stderr)
PY
}

TOKEN_BODY="$TMP_DIR/token.json"
TOKEN_HTTP="$(curl -sS -o "$TOKEN_BODY" -w '%{http_code}' \
  -X POST \
  --data-urlencode "client_id=${CHROME_WEBSTORE_CLIENT_ID}" \
  --data-urlencode "client_secret=${CHROME_WEBSTORE_CLIENT_SECRET}" \
  --data-urlencode "refresh_token=${CHROME_WEBSTORE_REFRESH_TOKEN}" \
  --data-urlencode "grant_type=refresh_token" \
  "$TOKEN_URL")"

if [[ "$TOKEN_HTTP" != "200" ]]; then
  echo "Error: OAuth token refresh returned HTTP $TOKEN_HTTP." >&2
  print_api_error "$TOKEN_BODY"
  exit 1
fi

ACCESS_TOKEN="$(json_field "$TOKEN_BODY" access_token)"
[[ -n "$ACCESS_TOKEN" ]] || { echo "Error: OAuth response did not include an access token." >&2; exit 1; }
auth_header=( -H "Authorization: Bearer ${ACCESS_TOKEN}" )
RESOURCE_NAME="publishers/${PUBLISHER_ID}/items/${ITEM_ID}"
STATUS_URL="$API_ROOT/v2/$RESOURCE_NAME:fetchStatus"

poll_upload() {
  local body="$TMP_DIR/status.json" http state
  for ((attempt=1; attempt<=MAX_POLLS; attempt++)); do
    http="$(curl -sS -o "$body" -w '%{http_code}' "${auth_header[@]}" "$STATUS_URL")"
    if [[ "$http" != "200" ]]; then
      echo "Error: Chrome upload status returned HTTP $http." >&2
      print_api_error "$body"
      return 1
    fi
    state="$(json_field "$body" lastAsyncUploadState)"
    echo "Package validation status: ${state:-UNKNOWN}"
    case "$state" in
      SUCCEEDED|UPLOAD_SUCCESS) return 0 ;;
      IN_PROGRESS|UPLOAD_IN_PROGRESS)
        if (( attempt == MAX_POLLS )); then
          echo "Error: Chrome upload did not finish after $MAX_POLLS checks." >&2
          return 1
        fi
        sleep "$POLL_SECONDS"
        ;;
      FAILED|UPLOAD_FAILURE|NOT_FOUND|UPLOAD_STATE_UNSPECIFIED|"")
        echo "Error: Chrome reported upload state ${state:-UNKNOWN}." >&2
        print_api_error "$body"
        return 1
        ;;
      *)
        echo "Error: unexpected Chrome upload state: $state" >&2
        print_api_error "$body"
        return 1
        ;;
    esac
  done
}

UPLOAD_BODY="$TMP_DIR/upload.json"
UPLOAD_URL="$API_ROOT/upload/v2/$RESOURCE_NAME:upload"
echo "Uploading package to the Chrome Web Store draft..."
UPLOAD_HTTP="$(curl -sS -o "$UPLOAD_BODY" -w '%{http_code}' \
  -X POST "${auth_header[@]}" \
  -H "Content-Type: application/zip" \
  --data-binary "@$ZIP_FILE" \
  "$UPLOAD_URL")"

if [[ "$UPLOAD_HTTP" != "200" ]]; then
  echo "Error: Chrome package upload returned HTTP $UPLOAD_HTTP." >&2
  print_api_error "$UPLOAD_BODY"
  exit 1
fi

UPLOAD_STATE="$(json_field "$UPLOAD_BODY" uploadState)"
UPLOAD_VERSION="$(json_field "$UPLOAD_BODY" crxVersion)"
echo "Initial upload status: ${UPLOAD_STATE:-UNKNOWN}${UPLOAD_VERSION:+ — version $UPLOAD_VERSION}"
case "$UPLOAD_STATE" in
  SUCCEEDED|UPLOAD_SUCCESS) ;;
  IN_PROGRESS|UPLOAD_IN_PROGRESS) poll_upload ;;
  FAILED|UPLOAD_FAILURE|NOT_FOUND|UPLOAD_STATE_UNSPECIFIED|"")
    echo "Error: Chrome rejected or could not identify the package upload." >&2
    print_api_error "$UPLOAD_BODY"
    exit 1
    ;;
  *)
    echo "Error: unexpected Chrome upload state: $UPLOAD_STATE" >&2
    print_api_error "$UPLOAD_BODY"
    exit 1
    ;;
esac

echo "The Chrome Web Store draft package is uploaded and validated."

if ! $SUBMIT; then
  echo "Not submitted for review. Re-run with --submit when ready."
  exit 0
fi

PUBLISH_TYPE="STAGED_PUBLISH"
if $AUTO_PUBLISH; then PUBLISH_TYPE="DEFAULT_PUBLISH"; fi
PUBLISH_REQUEST="$TMP_DIR/publish-request.json"
PUBLISH_BODY="$TMP_DIR/publish.json"
python3 - "$PUBLISH_REQUEST" "$PUBLISH_TYPE" <<'PY'
import json, sys
with open(sys.argv[1], "w", encoding="utf-8") as f:
    json.dump({
        "publishType": sys.argv[2],
        "skipReview": False,
        "blockOnWarnings": True,
    }, f)
PY

echo "Submitting v$MANIFEST_VERSION for Chrome review (${PUBLISH_TYPE})..."
PUBLISH_HTTP="$(curl -sS -o "$PUBLISH_BODY" -w '%{http_code}' \
  -X POST "${auth_header[@]}" \
  -H "Content-Type: application/json" \
  --data-binary "@$PUBLISH_REQUEST" \
  "$API_ROOT/v2/$RESOURCE_NAME:publish")"

if [[ "$PUBLISH_HTTP" != "200" ]]; then
  echo "Error: Chrome review submission returned HTTP $PUBLISH_HTTP." >&2
  print_api_error "$PUBLISH_BODY"
  exit 1
fi

PUBLISH_STATE="$(json_field "$PUBLISH_BODY" state)"
echo "Chrome submission state: ${PUBLISH_STATE:-UNKNOWN}"
case "$PUBLISH_STATE" in
  PENDING_REVIEW|STAGED|PUBLISHED|PUBLISHED_TO_TESTERS)
    ;;
  REJECTED|CANCELLED|ITEM_STATE_UNSPECIFIED|"")
    echo "Error: Chrome did not accept the submission." >&2
    print_api_error "$PUBLISH_BODY"
    exit 1
    ;;
  *)
    echo "Error: unexpected Chrome submission state: $PUBLISH_STATE" >&2
    print_api_error "$PUBLISH_BODY"
    exit 1
    ;;
esac

if $AUTO_PUBLISH; then
  echo "Chrome accepted v$MANIFEST_VERSION for review and will publish it automatically after approval."
else
  echo "Chrome accepted v$MANIFEST_VERSION for review; approval will leave it staged until manually published."
fi
