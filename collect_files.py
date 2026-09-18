#!/usr/bin/env python3
"""Work out exactly which files a build has to contain, by reading the manifest
and following its references, instead of trusting a hand-written list.

build.sh used to carry a hardcoded SHARED_FILES array. It silently fell behind
the code: prepaint.js, print.html, print.js and print.css were all referenced by
the extension but absent from the list, so anyone running build.sh would have
produced a package that was missing its pre-paint script and its whole print
page. Deriving the list means adding a file to the extension is enough.

Usage: collect_files.py <manifest-path> <extension-dir>
Prints one relative path per line. Exits non-zero if a referenced file is absent.
"""
import json
import os
import re
import sys


def html_refs(path):
    """src=/href= targets in an HTML file, ignoring absolute URLs and anchors."""
    try:
        with open(path, encoding="utf-8") as fh:
            html = fh.read()
    except OSError:
        return []
    out = []
    for m in re.finditer(r'(?:src|href)\s*=\s*["\']([^"\']+)["\']', html, re.I):
        ref = m.group(1).strip()
        if not ref or ref.startswith(("http://", "https://", "//", "#", "data:", "mailto:")):
            continue
        out.append(ref.split("?")[0].split("#")[0].lstrip("./"))
    return out


def main():
    manifest_path, base = sys.argv[1], sys.argv[2]
    with open(manifest_path, encoding="utf-8") as fh:
        mf = json.load(fh)

    wanted, missing = [], []

    def add(rel):
        rel = rel.lstrip("./")
        if not rel or rel in wanted:
            return
        full = os.path.join(base, rel)
        if os.path.isfile(full):
            wanted.append(rel)
        else:
            missing.append(rel)

    bg = mf.get("background", {})
    if "service_worker" in bg:
        add(bg["service_worker"])
    for s in bg.get("scripts", []):
        add(s)

    for cs in mf.get("content_scripts", []):
        for f in cs.get("js", []) + cs.get("css", []):
            add(f)

    for key in ("side_panel", "sidebar_action"):
        block = mf.get(key) or {}
        for sub in ("default_path", "default_panel"):
            if block.get(sub):
                add(block[sub])
        for icon in (block.get("default_icon") or {}).values():
            add(icon)

    for icon in (mf.get("icons") or {}).values():
        add(icon)
    for icon in ((mf.get("action") or {}).get("default_icon") or {}).values():
        add(icon)

    for war in mf.get("web_accessible_resources", []):
        for res in war.get("resources", []):
            if "*" in res:
                # e.g. "icons/*" — take everything in that directory.
                d = res.split("*")[0].rstrip("/")
                full_d = os.path.join(base, d)
                if os.path.isdir(full_d):
                    for name in sorted(os.listdir(full_d)):
                        if os.path.isfile(os.path.join(full_d, name)):
                            add(os.path.join(d, name))
            else:
                add(res)

    if mf.get("default_locale"):
        loc_dir = os.path.join(base, "_locales")
        for root, _dirs, files in os.walk(loc_dir):
            for name in sorted(files):
                add(os.path.relpath(os.path.join(root, name), base))

    # Follow HTML references, and the pages those pages pull in, until closed.
    seen = set()
    while True:
        pages = [f for f in wanted if f.lower().endswith(".html") and f not in seen]
        if not pages:
            break
        for page in pages:
            seen.add(page)
            for ref in html_refs(os.path.join(base, page)):
                add(ref)

    # print.html is opened from JS (a blob/tab handoff), so nothing in the
    # manifest points at it. Include it and whatever it references.
    # kjb-pce.txt is fetched from JS (chrome.runtime.getURL), so no HTML tag
    # points at it. print.html is opened from JS the same way.
    for extra in ("print.html", "kjb-pce.txt"):
        if os.path.isfile(os.path.join(base, extra)):
            add(extra)
            if extra.lower().endswith(".html"):
                for ref in html_refs(os.path.join(base, extra)):
                    add(ref)

    if missing:
        sys.stderr.write("MISSING referenced file(s): " + ", ".join(sorted(set(missing))) + "\n")
        return 1

    print("\n".join(wanted))
    return 0


if __name__ == "__main__":
    sys.exit(main())
