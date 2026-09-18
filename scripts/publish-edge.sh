#!/usr/bin/env bash
set -euo pipefail

API_ROOT="https://api.addons.microsoftedge.microsoft.com/v1"
DEFAULT_PRODUCT_ID="f28df267-07c5-4145-b2f4-dc1e22fb2026"

if [[ -f /app/.agents/.env ]]; then
  # An explicitly exported value wins: the secrets file can carry stale
  # duplicate entries from re-syncs (they caused the v0.4.251 401s).
  _K="${MICROSOFT_EDGE_API_KEY:-}"; _C="${MICROSOFT_EDGE_CLIENT_ID:-}"
  set -a
  # shellcheck disable=SC1091
  source /app/.agents/.env
  set +a
  [[ -n "$_K" ]] && MICROSOFT_EDGE_API_KEY="$_K"
  [[ -n "$_C" ]] && MICROSOFT_EDGE_CLIENT_ID="$_C"
fi

PRODUCT_ID="${MICROSOFT_EDGE_PRODUCT_ID:-$DEFAULT_PRODUCT_ID}"
SUBMIT=false
ZIP_FILE=""
NOTES_FILE=""
POLL_SECONDS="${EDGE_POLL_SECONDS:-10}"
MAX_POLLS="${EDGE_MAX_POLLS:-60}"

usage() {
  cat <<'EOF'
Usage:
  publish-edge.sh <extension.zip>
  publish-edge.sh <extension.zip> --submit --notes <reviewer-notes.txt>

Default behavior uploads and validates the package, but does not submit it.
Use --submit with --notes to explicitly submit the validated draft for review.

Environment:
  MICROSOFT_EDGE_CLIENT_ID     Required Edge Add-ons API v1.1 Client ID
  MICROSOFT_EDGE_API_KEY       Required Edge Add-ons API v1.1 API key
  MICROSOFT_EDGE_PRODUCT_ID    Optional override of the saved KJB Reader Product ID
  EDGE_POLL_SECONDS            Poll interval in seconds (default: 10)
  EDGE_MAX_POLLS               Maximum status checks per operation (default: 60)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --submit)
      SUBMIT=true
      shift
      ;;
    --notes)
      [[ $# -ge 2 ]] || { echo "Error: --notes requires a file path." >&2; exit 2; }
      NOTES_FILE="$2"
      shift 2
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
[[ "$PRODUCT_ID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]] || { echo "Error: invalid Edge Product ID." >&2; exit 2; }
[[ -n "${MICROSOFT_EDGE_CLIENT_ID:-}" ]] || { echo "Error: MICROSOFT_EDGE_CLIENT_ID is not configured." >&2; exit 2; }
[[ -n "${MICROSOFT_EDGE_API_KEY:-}" ]] || { echo "Error: MICROSOFT_EDGE_API_KEY is not configured." >&2; exit 2; }

if $SUBMIT; then
  [[ -n "$NOTES_FILE" ]] || { echo "Error: --submit requires --notes <file>." >&2; exit 2; }
  [[ -f "$NOTES_FILE" ]] || { echo "Error: reviewer-notes file not found: $NOTES_FILE" >&2; exit 2; }
  [[ -s "$NOTES_FILE" ]] || { echo "Error: reviewer-notes file is empty." >&2; exit 2; }
fi

command -v curl >/dev/null || { echo "Error: curl is required." >&2; exit 2; }
command -v python3 >/dev/null || { echo "Error: python3 is required." >&2; exit 2; }
command -v unzip >/dev/null || { echo "Error: unzip is required." >&2; exit 2; }
unzip -tq "$ZIP_FILE" >/dev/null || { echo "Error: ZIP integrity check failed." >&2; exit 2; }

MANIFEST_VERSION="$(unzip -p "$ZIP_FILE" manifest.json | python3 -c 'import json,sys; print(json.load(sys.stdin).get("version", "unknown"))')"
echo "Package: $ZIP_FILE"
echo "Manifest version: $MANIFEST_VERSION"
echo "Edge Product ID: $PRODUCT_ID"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

curl_auth_args=(
  -H "Authorization: ApiKey ${MICROSOFT_EDGE_API_KEY}"
  -H "X-ClientID: ${MICROSOFT_EDGE_CLIENT_ID}"
)

extract_operation_id() {
  local headers="$1" location
  location="$(tr -d '\r' < "$headers" | awk -F': ' 'tolower($1)=="location" {print $2}' | tail -n 1)"
  [[ -n "$location" ]] || return 1
  printf '%s\n' "${location##*/}"
}

json_field() {
  local file="$1" field="$2"
  python3 - "$file" "$field" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    data = json.load(f)
value = data.get(sys.argv[2])
if value is None:
    print("")
elif isinstance(value, (dict, list)):
    print(json.dumps(value, ensure_ascii=False))
else:
    print(value)
PY
}

poll_operation() {
  local url="$1" label="$2" body="$TMP_DIR/status.json" status message http
  for ((attempt=1; attempt<=MAX_POLLS; attempt++)); do
    http="$(curl -sS -o "$body" -w '%{http_code}' "${curl_auth_args[@]}" "$url")"
    # Microsoft returns 202 while an operation is still processing and
    # 200 when a terminal status is available.
    if [[ "$http" != "200" && "$http" != "202" ]]; then
      echo "Error: $label status request returned HTTP $http." >&2
      cat "$body" >&2 || true
      return 1
    fi
    status="$(json_field "$body" status)"
    message="$(json_field "$body" message)"
    echo "$label status: ${status:-Unknown}${message:+ — $message}"
    case "$status" in
      Succeeded) return 0 ;;
      Failed)
        echo "Microsoft response:" >&2
        cat "$body" >&2
        return 1
        ;;
      InProgress|NotStarted|"")
        if (( attempt == MAX_POLLS )); then
          echo "Error: $label did not finish after $MAX_POLLS checks." >&2
          return 1
        fi
        sleep "$POLL_SECONDS"
        ;;
      *)
        echo "Error: unexpected $label status: $status" >&2
        cat "$body" >&2
        return 1
        ;;
    esac
  done
}

UPLOAD_HEADERS="$TMP_DIR/upload.headers"
UPLOAD_BODY="$TMP_DIR/upload.body"
UPLOAD_URL="$API_ROOT/products/$PRODUCT_ID/submissions/draft/package"

echo "Uploading package to the Edge draft..."
UPLOAD_HTTP="$(curl -sS -D "$UPLOAD_HEADERS" -o "$UPLOAD_BODY" -w '%{http_code}' \
  -X POST "${curl_auth_args[@]}" \
  -H "Content-Type: application/zip" \
  --data-binary "@$ZIP_FILE" \
  "$UPLOAD_URL")"

if [[ "$UPLOAD_HTTP" != "202" ]]; then
  echo "Error: package upload returned HTTP $UPLOAD_HTTP." >&2
  cat "$UPLOAD_BODY" >&2 || true
  exit 1
fi

UPLOAD_OPERATION_ID="$(extract_operation_id "$UPLOAD_HEADERS")" || {
  echo "Error: Microsoft accepted the upload but did not return an operation ID." >&2
  exit 1
}
echo "Upload operation: $UPLOAD_OPERATION_ID"
poll_operation "$API_ROOT/products/$PRODUCT_ID/submissions/draft/package/operations/$UPLOAD_OPERATION_ID" "Package validation"

echo "The Edge draft package is uploaded and validated."

if ! $SUBMIT; then
  echo "Not submitted for certification. Re-run with --submit --notes <file> when ready."
  exit 0
fi

PUBLISH_HEADERS="$TMP_DIR/publish.headers"
PUBLISH_BODY="$TMP_DIR/publish.body"
PUBLISH_URL="$API_ROOT/products/$PRODUCT_ID/submissions"

echo "Submitting the validated draft for Edge certification..."
PUBLISH_HTTP="$(curl -sS -D "$PUBLISH_HEADERS" -o "$PUBLISH_BODY" -w '%{http_code}' \
  -X POST "${curl_auth_args[@]}" \
  -H "Content-Type: text/plain; charset=utf-8" \
  --data-binary "@$NOTES_FILE" \
  "$PUBLISH_URL")"

if [[ "$PUBLISH_HTTP" != "202" ]]; then
  echo "Error: submission request returned HTTP $PUBLISH_HTTP." >&2
  cat "$PUBLISH_BODY" >&2 || true
  exit 1
fi

PUBLISH_OPERATION_ID="$(extract_operation_id "$PUBLISH_HEADERS")" || {
  echo "Error: Microsoft accepted the submission but did not return an operation ID." >&2
  exit 1
}
echo "Publish operation: $PUBLISH_OPERATION_ID"
poll_operation "$API_ROOT/products/$PRODUCT_ID/submissions/operations/$PUBLISH_OPERATION_ID" "Certification submission"

echo "Edge Add-ons accepted v$MANIFEST_VERSION for certification."
