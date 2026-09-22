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

    old_popup = (
        'if (actionApi && typeof actionApi.setPopup === "function") {\n'
        '      const popupResult = actionApi.setPopup({ popup: isAndroid ? "sidebar.html" : "" });'
    )
    new_popup = (
        'if (actionApi && typeof actionApi.setPopup === "function") {\n'
        "      // Safari toolbar always uses the dedicated, explicitly-sized popup.\n"
        '      const popupResult = actionApi.setPopup({ popup: "toolbar.html" });'
    )
    if old_popup not in src:
        fail("background.js configurePlatformAction popup anchor not found")
    return src.replace(old_popup, new_popup, 1)


def make_toolbar_popup():
    source = (SAFARI / "sidebar.html").read_text(encoding="utf-8")
    css_link = '  <link rel="stylesheet" href="safari-toolbar.css">\n'
    anchor = '  <link rel="stylesheet" href="sidebar.css">\n'
    if anchor not in source:
        fail("sidebar.html stylesheet anchor not found")
    popup = source.replace(anchor, anchor + css_link, 1)
    (SAFARI / "toolbar.html").write_text(popup, encoding="utf-8")

    # Safari popovers need an intrinsic pixel size. width:100% / height:100%
    # alone is circular sizing and produced the tiny blank blob that vanished.
    (SAFARI / "safari-toolbar.css").write_text(
        "html, body {\n"
        "  width: 420px !important;\n"
        "  min-width: 420px !important;\n"
        "  height: 600px !important;\n"
        "  min-height: 600px !important;\n"
        "  margin: 0 !important;\n"
        "}\n"
        "#app { width: 420px; height: 600px; }\n",
        encoding="utf-8",
    )

    # A toolbar popover is not a persistent side panel. Prevent it from
    # publishing side-panel heartbeats or close notifications.
    js = SAFARI / "sidebar.js"
    text = js.read_text(encoding="utf-8")
    old = "const KJB_IS_SIDE_PANEL = !KJB_IS_OVERLAY && !KJB_IS_LOOKUP_WINDOW;"
    new = "const KJB_IS_TOOLBAR_POPUP = location.pathname.endsWith('/toolbar.html');\n  const KJB_IS_SIDE_PANEL = !KJB_IS_OVERLAY && !KJB_IS_LOOKUP_WINDOW && !KJB_IS_TOOLBAR_POPUP;"
    if old not in text:
        fail("sidebar.js context anchor not found")
    js.write_text(text.replace(old, new, 1), encoding="utf-8")


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
    print("created toolbar.html + explicit 420x600 Safari popup sizing")

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
