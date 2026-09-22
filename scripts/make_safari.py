#!/usr/bin/env python3
"""Build the Safari variant of KJB Reader from the finished Chrome build.

Safari has no side-panel API, so this script:
  1. copies build/chrome -> build/safari
  2. creates a dedicated, explicitly-sized toolbar popup from sidebar.html
  3. patches manifest.json (drops sidePanel and points the action at toolbar.html)
  4. patches background.js deterministically for Safari (no UA sniffing)

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
    # This is a Safari-only build, so do not guess from the service worker UA.
    # Safari's worker UA is not stable across macOS releases; a failed guess
    # classified Safari as Opera and replaced the toolbar popup with the
    # in-page overlay route.
    anchor = "const isOpera = !isFirefox && !hasChromeSidePanel;"
    replacement = "const isSafari = true;\nconst isOpera = false;"
    if anchor not in src:
        fail("background.js platform anchor not found; update make_safari.py")
    src = src.replace(anchor, replacement, 1)

    # The manifest already establishes toolbar.html before the worker starts.
    # Calling action.setPopup() as the first click wakes the worker closes the
    # popover Safari has just opened. The second click then works, producing the
    # repeatable "blob, close, then open" symptom. Never reconfigure it at runtime.
    configure_anchor = "function configurePlatformAction() {\n  if (isFirefox) return;"
    configure_replacement = "function configurePlatformAction() {\n  if (isFirefox || isSafari) return;"
    if configure_anchor not in src:
        fail("background.js configurePlatformAction anchor not found")
    return src.replace(configure_anchor, configure_replacement, 1)


def make_toolbar_popup():
    # Keep Safari's actual popover document tiny and completely static. Safari
    # decides whether to keep the popover open while its first document is
    # loading; using the full reader as that document let prepaint.js, viewport
    # measurements and UI scaling race the initial popover geometry. A fixed
    # outer shell gives Safari its final 420x600 size synchronously, then loads
    # the full reader inside without ever resizing the popover itself.
    popup = """<!DOCTYPE html>
<html lang="en" style="width:420px;height:600px;margin:0;overflow:hidden">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=420, initial-scale=1">
  <title>KJB Reader</title>
  <style>
    html, body { width:420px; height:600px; min-width:420px; min-height:600px; margin:0; overflow:hidden; }
    iframe { display:block; width:420px; height:600px; border:0; }
  </style>
</head>
<body style="width:420px;height:600px;margin:0;overflow:hidden">
  <iframe src="sidebar.html?ctx=toolbar" title="KJB Reader"></iframe>
</body>
</html>
"""
    (SAFARI / "toolbar.html").write_text(popup, encoding="utf-8")


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
    m.setdefault("action", {})["default_popup"] = "toolbar.html"
    m["action"]["default_title"] = "KJB Reader"
    mpath.write_text(json.dumps(m, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("patched manifest.json (no sidePanel, toolbar.html popup action)")

    # --- dedicated toolbar popup ---
    make_toolbar_popup()
    print("created static 420x600 toolbar shell around the reader")

    # --- background ---
    bpath = SAFARI / "background.js"
    bpath.write_text(patch_background(bpath.read_text(encoding="utf-8")), encoding="utf-8")
    print("patched background.js (deterministic Safari toolbar route)")

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
