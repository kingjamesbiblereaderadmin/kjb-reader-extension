#!/bin/bash
# Builds the Chrome/Edge, Firefox and Opera packages.
#
# Two bugs this script used to have, both of which shipped broken zips:
#   1. A hardcoded SHARED_FILES list that fell out of date — prepaint.js and the
#      whole print page (print.html/js/css) were missing from it. The file list
#      now comes from collect_files.py, which reads the manifest and follows its
#      references, so adding a file to the extension is enough.
#   2. `zip -r` onto an existing archive APPENDS, producing duplicate entries
#      (a real regression we chased once already). Each zip is removed first.
# It also refuses to build if the manifest version and content.js's
# KJB_CONTENT_VERSION disagree, which has previously made a "fixed" build look
# broken in tabs that were already open.
set -euo pipefail

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$BASE_DIR/build"
VERSION=$(python3 -c "import json;print(json.load(open('$BASE_DIR/manifest.json'))['version'])")

STAMP=$(grep -m1 'KJB_CONTENT_VERSION *=' "$BASE_DIR/content.js" | sed 's/.*"\(.*\)".*/\1/')
if [ "$STAMP" != "$VERSION" ]; then
  echo "ERROR: manifest.json says $VERSION but content.js KJB_CONTENT_VERSION says $STAMP." >&2
  echo "       Bump both — the stamp is what lets open tabs notice an update." >&2
  exit 1
fi

# Opera ships the Chromium manifest. Keeping a separate manifest.opera.json let
# it rot at 0.4.145 (no side_panel) while the released Opera zips were quietly
# built from the Chrome one, so it is now generated rather than maintained.
cp "$BASE_DIR/manifest.json" "$BASE_DIR/manifest.opera.json"

build() {
  local browser="$1" manifest="$2" background="$3"
  local out="$BUILD_DIR/$browser"
  local zip="$BUILD_DIR/kjb-reader-${browser}-v${VERSION}.zip"
  echo "Building ${browser} v${VERSION}..."

  rm -rf "$out"
  mkdir -p "$out"

  # Fails loudly if the manifest references something that is not on disk.
  local files
  files=$(python3 "$BASE_DIR/collect_files.py" "$BASE_DIR/$manifest" "$BASE_DIR")

  cp "$BASE_DIR/$manifest" "$out/manifest.json"
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    mkdir -p "$out/$(dirname "$f")"
    cp "$BASE_DIR/$f" "$out/$f"
  done <<< "$files"

  # background.* is named per browser and is already covered by the manifest
  # walk, but assert it landed — a missing worker is a silent dead extension.
  if [ ! -f "$out/$background" ]; then
    echo "ERROR: $background missing from the $browser build" >&2
    exit 1
  fi

  rm -f "$zip"                      # never append into an existing archive
  ( cd "$out" && zip -qr "$zip" . )

  if unzip -l "$zip" | awk '{print $4}' | grep -v '/$' | sort | uniq -d | grep -q .; then
    echo "ERROR: duplicate entries in $zip" >&2
    exit 1
  fi
  echo "  $browser: $(unzip -l "$zip" | tail -1 | awk '{print $2}') files -> $zip"
}

mkdir -p "$BUILD_DIR"
case "${1:-all}" in
  chrome)  build chrome  manifest.json         background.js ;;
  firefox) build firefox manifest.firefox.json background.firefox.js ;;
  opera)   build opera   manifest.opera.json   background.js ;;
  safari)
    # Safari ships the Chromium package minus sidePanel (Safari has no
    # side-panel API) with the toolbar action as a popup. make_safari.py
    # patches from the finished Chrome build, so build chrome first.
    build chrome  manifest.json         background.js
    python3 "$BASE_DIR/scripts/make_safari.py"
    ;;
  all)
    build chrome  manifest.json         background.js
    build firefox manifest.firefox.json background.firefox.js
    build opera   manifest.opera.json   background.js
    ;;
  *) echo "Usage: $0 [chrome|firefox|opera|safari|all]" >&2; exit 1 ;;
esac
echo "Done — v${VERSION}"
