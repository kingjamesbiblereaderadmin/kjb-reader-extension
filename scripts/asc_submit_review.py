#!/usr/bin/env python3
"""Create App Store versions, attach uploaded builds, and submit for review.

Runs on the GitHub Actions macOS runner after the safari-release.yml upload
step (or locally against App Store Connect).

Usage:
  asc_submit_review.py <version> <build_number> [--bundle-id <id>]

Environment:
  ASC_KEY_ID        App Store Connect API key ID
  ASC_ISSUER_ID     App Store Connect issuer ID
  ASC_KEY_PATH      Path to the .p8 private key
  APP_BUNDLE_ID     Optional default bundle id (or pass --bundle-id)

Flow, per platform (MAC_OS and IOS):
  1. Poll the just-uploaded build until Apple finishes processing (VALID).
  2. Find an editable App Store version with this version string, or create
     one (usesNonExemptEncryption=false, like the build itself).
  3. If the new version has no localizations, clone them from the most recent
     existing version so the store listing is never blank.
  4. Attach the build to the version.
Then one POST /v1/appStoreSubmissions pushes every ready platform version of
the app into the review queue — the same thing as clicking "Submit for Review"
in App Store Connect.

Any API validation error is printed in full so the first run surfaces exactly
what (if anything) still needs a manual one-time setup in ASC.
"""
import json
import os
import subprocess
import sys
import time

try:
    import jwt
except ImportError:
    print("pyjwt not installed: python3 -m pip install 'pyjwt[crypto]'", file=sys.stderr)
    sys.exit(2)

API_ROOT = "https://api.appstoreconnect.apple.com"
PLATFORMS = ["MAC_OS", "IOS"]
EDITABLE_STATES = {"PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED"}
SUBMITTED_STATES = {"READY_FOR_REVIEW", "WAITING_FOR_REVIEW", "IN_REVIEW",
                    "PENDING_APPLE_RELEASE", "PENDING_DEVELOPER_RELEASE",
                    "PROCESSING_FOR_APP_STORE", "READY_FOR_SALE"}
LOCALE_TEXT_FIELDS = ["description", "keywords", "locale", "marketingUrl",
                      "promotionalText", "supportUrl", "whatsNew"]


def make_api():
    key_id = os.environ["ASC_KEY_ID"]
    issuer = os.environ["ASC_ISSUER_ID"]
    key_path = os.environ["ASC_KEY_PATH"]
    with open(key_path) as f:
        key = f.read()

    def token():
        now = int(time.time())
        return jwt.encode({"iss": issuer, "iat": now, "exp": now + 600,
                           "aud": "appstoreconnect-v1"}, key,
                          algorithm="ES256", headers={"kid": key_id})

    def api(path, method="GET", data=None):
        body = json.dumps(data) if data else None
        r = subprocess.run(
            ["curl", "-sS", "-g", "-w", "\n%{http_code}", "-X", method,
             "-H", "Authorization: Bearer " + token(),
             "-H", "Content-Type: application/json"] +
            (["-d", body] if body else []) +
            [API_ROOT + path], capture_output=True, text=True)
        out, _, code = r.stdout.rpartition("\n")
        if not code.strip().isdigit():
            print("curl failed for", path, "\n", r.stderr[:500], file=sys.stderr)
            sys.exit(2)
        try:
            payload = json.loads(out) if out.strip() else {}
        except json.JSONDecodeError:
            payload = out
        return int(code), payload

    return api


def die_api(where, code, payload):
    print(f"\nFAILED at {where}: HTTP {code}", file=sys.stderr)
    print(json.dumps(payload, indent=2)[:4000], file=sys.stderr)
    sys.exit(1)


def api_errors(payload):
    errs = payload.get("errors") if isinstance(payload, dict) else None
    if not errs:
        return []
    return [f"{e.get('title')}: {e.get('detail')}" +
            "".join(f"\n    {d.get('field')}: {d.get('error')}" for d in e.get("meta", {}).get("associatedFields", {}).items())
            for e in errs]


def main():
    version = sys.argv[1]
    build_num = sys.argv[2]
    bundle_id = os.environ.get("APP_BUNDLE_ID") or "com.kingjamesbiblereader.kjbreaderforsafari"
    api = make_api()

    # --- the app record ---
    code, apps = api(f"/v1/apps?filter[bundleId]={bundle_id}&limit=5")
    data = apps.get("data") or []
    if code != 200 or not data:
        die_api("lookup app", code, apps)
    app_id = data[0]["id"]
    print(f"app: {app_id} ({data[0]['attributes']['name']})")

    # --- 1. wait for the uploaded builds to finish processing ---
    # Poll all platforms in one pass; a platform whose upload failed or
    # lagged must not block the others behind its own 25-minute window.
    deadline = time.time() + 25 * 60
    resolved = {}  # platform -> build id, once VALID (or None on failure)
    while len(resolved) < len(PLATFORMS) and time.time() < deadline:
        code, builds = api(
            f"/v1/builds?filter[app]={app_id}&filter[version]={build_num}"
            f"&include=preReleaseVersion&limit=20")
        if code != 200:
            die_api("list builds", code, builds)
        # Match by build number + platform. The pre-release version
        # string is NOT the marketing version (Apple reports e.g.
        # "2.58" for build 58), so never filter on it.
        pr_by_id = {inc.get("id"): inc for inc in builds.get("included", [])
                    if inc.get("type") == "preReleaseVersions"}
        per_platform = {}
        for b in (builds.get("data") or []):
            plat = pr_by_id.get((b.get("relationships", {})
                                 .get("preReleaseVersion", {})
                                 .get("data") or {}).get("id"),
                                {}).get("attributes", {}).get("platform")
            if plat and plat not in per_platform:
                per_platform[plat] = b
        for platform in PLATFORMS:
            if platform in resolved:
                continue
            b = per_platform.get(platform)
            if not b:
                continue
            state = b["attributes"]["processingState"]
            print(f"{platform}: build {b['id']} processing state: {state}")
            if state == "VALID":
                resolved[platform] = b["id"]
            elif state == "INVALID":
                print(f"{platform}: uploaded build failed Apple processing — not submitting", file=sys.stderr)
                resolved[platform] = None
        time.sleep(30)
    for platform in PLATFORMS:
        if platform not in resolved:
            print(f"{platform}: no processed build {build_num} appeared in time — skipping platform", file=sys.stderr)
            resolved[platform] = None

    ready_any = False
    for platform in PLATFORMS:
        build_id = resolved.get(platform)
        if not build_id:
            continue

        # --- 2. find or create the App Store version ---
        code, versions = api(
            f"/v1/apps/{app_id}/appStoreVersions?filter[platform]={platform}&limit=50")
        if code != 200:
            die_api("list versions", code, versions)
        existing = [v for v in versions.get("data") or []
                    if v["attributes"]["versionString"] == version]
        if existing:
            ver = existing[0]
            state = ver["attributes"].get("appStoreState") or ver["attributes"].get("state")
            print(f"{platform}: version {version} already exists (state {state})")
            if state in SUBMITTED_STATES:
                print(f"{platform}: already submitted — nothing to do")
                ready_any = True
                continue
            if state not in EDITABLE_STATES:
                print(f"{platform}: version in state {state}, leaving it alone")
                continue
            version_id = ver["id"]
        else:
            code, created = api("/v1/appStoreVersions", "POST", {
                "data": {
                    "type": "appStoreVersions",
                    "attributes": {
                        "platform": platform,
                        "versionString": version,
                        "usesNonExemptEncryption": False,
                    },
                    "relationships": {
                        "app": {"data": {"type": "apps", "id": app_id}},
                    }}})
            if code != 201:
                die_api(f"create {platform} version {version}", code, created)
            version_id = created["data"]["id"]
            print(f"{platform}: created version {version} ({version_id})")

            # --- 3. clone localizations from the previous version if blank ---
            code, locs = api(f"/v1/appStoreVersions/{version_id}/appStoreVersionLocalizations?limit=30")
            if code == 200 and not (locs.get("data") or []):
                prev = next((v for v in versions.get("data") or []
                             if v["id"] != version_id), None)
                if prev:
                    code, plocs = api(f"/v1/appStoreVersions/{prev['id']}/appStoreVersionLocalizations?limit=30")
                    for ploc in (plocs.get("data") or []):
                        attrs = {k: v for k, v in ploc["attributes"].items()
                                 if k in LOCALE_TEXT_FIELDS and k != "locale" and v}
                        body = {"data": {"type": "appStoreVersionLocalizations",
                                         "attributes": {"locale": ploc["attributes"]["locale"], **attrs},
                                         "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": version_id}}}}}
                        c2, _ = api("/v1/appStoreVersionLocalizations", "POST", body)
                        if c2 == 201:
                            print(f"{platform}: cloned localization {ploc['attributes']['locale']} from {prev['attributes']['versionString']}")

        # --- 4. attach the build ---
        code, attach = api("/v1/appStoreVersionBuilds", "POST", {
            "data": {
                "type": "appStoreVersionBuilds",
                "relationships": {
                    "appStoreVersion": {"data": {"type": "appStoreVersions", "id": version_id}},
                    "build": {"data": {"type": "builds", "id": build_id}},
                }}})
        if code == 201:
            print(f"{platform}: attached build {build_num} to version {version}")
        else:
            for msg in api_errors(attach):
                if "already" in msg.lower():
                    print(f"{platform}: build already attached")
                else:
                    print(f"{platform}: attach build issue: {msg}", file=sys.stderr)
        ready_any = True

    if not ready_any:
        print("no platform had a processed build to submit", file=sys.stderr)
        sys.exit(1)

    # --- 5. submit the app for review (covers every ready platform version) ---
    code, sub = api("/v1/appStoreSubmissions", "POST", {
        "data": {
            "type": "appStoreSubmissions",
            "relationships": {"app": {"data": {"type": "apps", "id": app_id}}},
        }})
    if code in (201, 200):
        print("\nSUBMITTED FOR REVIEW — App Store review queue entered for all ready platform versions.")
    else:
        errs = api_errors(sub)
        if errs and any("already" in e.lower() or "submission" in e.lower() for e in errs):
            print("submission exists:", "; ".join(errs))
        else:
            die_api("submit for review", code, sub)


if __name__ == "__main__":
    main()
