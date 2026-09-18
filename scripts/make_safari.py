#!/usr/bin/env python3
"""Build the Safari variant of KJB Reader from the finished Chrome build.

Safari has no side-panel API, so this script:
  1. copies build/chrome -> build/safari
  2. patches manifest.json  (drops sidePanel permission + side_panel key,
     adds action.default_popup = sidebar.html, retitles the action)
  3. patches background.js  (isSafari detection + toolbar popup like Android)

Every patch uses exact string anchors. If background.js is ever refactored,
the anchors stop matching and this script FAILS LOUDLY instead of silently
shipping an unpatched Safari build — update the anchors below when that
happens.

Usage:  python3 scripts/make_safari.py      (run ./build.sh safari, which
        builds chrome first and then calls this)
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
BUILD = BASE / "build"
CHROME = BUILD / "chrome"
SAFARI = BUILD / "safari"


def fail(msg):
    print(f"make_safari: ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def patch_background(src: str) -> str:
    anchor = "const isOpera = !isFirefox && !hasChromeSidePanel;"
    if anchor not in src:
        fail(
            "background.js anchor 'const isOpera = ...' not found. "
            "background.js was refactored — update the anchors in "
            "scripts/make_safari.py."
        )
    safari_detect = (
        anchor
        + '\nconst isSafari = !isFirefox && typeof navigator !== "undefined"'
        + ' && /\\bSafari\\//.test(navigator.userAgent)'
        + ' && !/Chrome|Chromium|Edg\\/|OPR|Firefox/.test(navigator.userAgent);'
    )
    src = src.replace(anchor, safari_detect, 1)

    old_popup = (
        'if (actionApi && typeof actionApi.setPopup === "function") {\n'
        '      const popupResult = actionApi.setPopup({ popup: isAndroid ? "sidebar.html" : "" });'
    )
    new_popup = (
        'if (actionApi && typeof actionApi.setPopup === "function") {\n'
        "      // Safari has no sidePanel API: the toolbar icon opens the full reader\n"
        "      // as a popup (same proven path as Android).\n"
        '      const popupPath = (isAndroid || isSafari) ? "sidebar.html" : "";\n'
        "      const popupResult = actionApi.setPopup({ popup: popupPath });"
    )
    if old_popup not in src:
        fail(
            "background.js configurePlatformAction popup line not found. "
            "Update the anchors in scripts/make_safari.py."
        )
    src = src.replace(old_popup, new_popup, 1)
    return src


def main():
    if not CHROME.is_dir():
        fail("build/chrome not found — run ./build.sh chrome first.")

    if SAFARI.exists():
        shutil.rmtree(SAFARI)
    shutil.copytree(CHROME, SAFARI)
    print("copied build/chrome -> build/safari")

    # --- manifest ---
    mpath = SAFARI / "manifest.json"
    m = json.loads(mpath.read_text(encoding="utf-8"))
    if "sidePanel" in m.get("permissions", []):
        m["permissions"].remove("sidePanel")
    if "side_panel" in m:
        del m["side_panel"]
    m.setdefault("action", {})["default_popup"] = "sidebar.html"
    m["action"]["default_title"] = "KJB Reader"
    mpath.write_text(json.dumps(m, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("patched manifest.json (no sidePanel, popup action)")

    # --- background ---
    bpath = SAFARI / "background.js"
    bpath.write_text(patch_background(bpath.read_text(encoding="utf-8")), encoding="utf-8")
    print("patched background.js (isSafari + popup path)")

    # --- zip ---
    version = m["version"]
    zpath = BUILD / f"kjb-reader-safari-v{version}.zip"
    if zpath.exists():
        zpath.unlink()  # never append into an existing archive
    subprocess.run(
        ["zip", "-qr", str(zpath), "."], cwd=SAFARI, check=True
    )
    print(f"built {zpath.name}")

    # --- sanity: node syntax + manifest still walks ---
    subprocess.run(["node", "--check", str(bpath)], check=True)
    print("background.js syntax OK")


if __name__ == "__main__":
    main()
