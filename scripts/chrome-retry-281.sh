#!/usr/bin/env bash
# Retry loop: re-runs the Chrome Web Store upload+submit for v0.4.281 every
# 15 minutes until the v0.4.280 review completes ("in review" blocks edits).
set -uo pipefail
cd /app/conversations/6a713f6111d24606471264f2/kjb-extension
LOG="/tmp/chrome-retry-281.log"
attempt=1
while true; do
  OUT=$(timeout 500 bash scripts/publish-chrome.sh build/kjb-reader-chrome-v0.4.281.zip --submit 2>&1)
  if echo "$OUT" | grep -q "in review"; then
    echo "[$(date '+%H:%M:%S')] attempt $attempt: still in review" >> "$LOG"
  elif echo "$OUT" | grep -q "accepted\|started review\|Review\|Submitted"; then
    echo "[$(date '+%H:%M:%S')] attempt $attempt: SUBMITTED" >> "$LOG"
    echo "$OUT" >> "$LOG"
    echo "ACCEPTED"
    exit 0
  else
    echo "[$(date '+%H:%M:%S')] attempt $attempt: other outcome" >> "$LOG"
    echo "$OUT" | tail -5 >> "$LOG"
  fi
  attempt=$((attempt+1))
  sleep 900
done
