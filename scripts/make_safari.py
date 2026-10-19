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
    src = src.replace(configure_anchor, configure_replacement, 1)

    # Safari-only build: the page-click routing fix must not depend on the
    # service-worker UA either. The source file detects Safari from the UA
    # (isSafariBG); here it is pinned, same policy as isSafari above.
    bg_safari_anchor = (
        "const isSafariBG = /AppleWebKit/.test(navigator.userAgent) &&\n"
        "  /\\bVersion\\/\\d/.test(navigator.userAgent) &&\n"
        "  !/Chrome|Chromium|Edg\\b|Edg\\/|OPR\\/|OPX\\/|Firefox\\//.test(navigator.userAgent);"
    )
    if bg_safari_anchor not in src:
        fail("background.js isSafariBG anchor not found; update make_safari.py")
    src = src.replace(
        bg_safari_anchor,
        "const isSafariBG = true;  // Safari-only build — deterministic (source uses the UA rule).",
        1,
    )
    return src


def patch_content(src: str) -> str:
    # Same policy for the content script: the source detects Safari from the
    # page UA; the Safari-only build pins it so no UA edge case can re-enable
    # panel routing (sidebar capturing page clicks).
    content_safari_anchor = (
        "const isSafariUA = /AppleWebKit/.test(navigator.userAgent) &&\n"
        "  /\\bVersion\\/\\d/.test(navigator.userAgent) &&\n"
        "  !/Chrome|Chromium|Edg\\b|Edg\\/|OPR\\/|OPX\\/|Firefox\\//.test(navigator.userAgent);"
    )
    if content_safari_anchor not in src:
        fail("content.js isSafariUA anchor not found; update make_safari.py")
    return src.replace(
        content_safari_anchor,
        "const isSafariUA = true;  // Safari-only build — deterministic (source uses the UA rule).",
        1,
    )


def make_toolbar_popup():
    # Keep Safari's actual popover document tiny and completely static. Safari
    # decides whether to keep the popover open while its first document is
    # loading; using the full reader as that document let prepaint.js, viewport
    # measurements and UI scaling race the initial popover geometry. A fixed
    # outer shell gives Safari its final 420x600 size synchronously, then loads
    # the full reader inside without ever resizing the popover itself.
    popup = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>KJB Reader - SidePanel</title>
  <style>
    html, body { width:420px; height:600px; min-width:420px; min-height:600px; margin:0; overflow:hidden; }
    iframe { display:block; width:420px; height:600px; border:0; }
    /* Desktop Safari needs a synchronous 420x600 popover. On iPhone/iPad that
       fixed canvas occupies only part of the taller extension sheet, leaving
       the footer halfway up. Coarse-touch Safari uses its live visual viewport. */
    @media (hover: none) and (pointer: coarse) {
      html, body { width:100vw; height:100vh; height:100dvh; min-width:0; min-height:0; }
      iframe { width:100vw; height:100vh; height:100dvh; }
    }
  </style>
</head>
<body>
  <iframe src="sidebar.html?ctx=toolbar" title="KJB Reader - SidePanel"></iframe>
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

    cpath = SAFARI / "content.js"
    cpath.write_text(patch_content(cpath.read_text(encoding="utf-8")), encoding="utf-8")
    print("patched content.js (Safari overlay routing: sidebar never captures page clicks)")

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
