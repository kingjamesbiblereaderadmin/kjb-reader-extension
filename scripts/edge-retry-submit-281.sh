#!/usr/bin/env bash
# Retry loop: keeps POSTing the Edge certification submission every 10 minutes
# until the InProgressSubmission slot frees (v0.4.280 review must finish first).
# The draft already contains the validated v0.4.281 package.
set -uo pipefail

API_ROOT="https://api.addons.microsoftedge.microsoft.com/v1"
PRODUCT_ID="f28df267-07c5-4145-b2f4-dc1e22fb2026"
NOTES_FILE="/tmp/edge-notes-281.txt"
LOG="/tmp/edge-retry-281.log"

[[ -f /app/.agents/.env ]] && { set -a; source /app/.agents/.env; set +a; }

AUTH=(-H "Authorization: ApiKey $MICROSOFT_EDGE_API_KEY" -H "X-ClientID: $MICROSOFT_EDGE_CLIENT_ID")

attempt=1
while true; do
  BODY=$(mktemp)
  HTTP=$(curl -sS -o "$BODY" -w '%{http_code}' \
    -X POST "${AUTH[@]}" \
    -H "Content-Type: text/plain; charset=utf-8" \
    --data-binary "@$NOTES_FILE" \
    "$API_ROOT/products/$PRODUCT_ID/submissions")
  STATUS=$(python3 -c "import json,sys; d=json.load(open('$BODY')); print(d.get('status',''), d.get('errorCode',''), d.get('message','')[:80])" 2>/dev/null || echo "parse-failed")
  echo "[$(date '+%H:%M:%S')] attempt $attempt: HTTP $HTTP | $STATUS" >> "$LOG"
  if [[ "$HTTP" == "202" ]]; then
    echo "[$(date '+%H:%M:%S')] SUBMISSION ACCEPTED" >> "$LOG"
    echo "ACCEPTED"
    exit 0
  fi
  # 409/Failed with InProgressSubmission → review still running; 400s persist too.
  attempt=$((attempt+1))
  sleep 600
done
