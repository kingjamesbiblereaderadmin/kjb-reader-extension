# KJB Reader — Cross-Browser Publishing Guide

## Version 0.4.0 — Chrome, Edge, Firefox, Safari

---

## Chrome Web Store (Chrome + Brave + Vivaldi + Arc)

1. Go to https://chrome.google.com/webstore/devconsole
2. Upload `kjb-reader-v0.4.0-chrome.zip`
3. Fill in listing details
4. **Privacy Practices → Permissions:**
   - `activeTab`: "Detects Bible verse references in the text of the current web page so users can click them to look up the verse."
   - `sidePanel`: "Opens a sidebar panel to display Bible verses and search results."
   - `contextMenus`: "Adds right-click menu items for verse lookup and keyword search."
   - `storage`: "Saves user preferences (theme, tab state, search options)."
   - `tabs`: "Opens Bible references on the KJB Reader website when clicked."
5. **Data usage:**
   - "Does your extension read or access website content?" → **Yes**
   - Justification: "The content script scans page text locally for Bible verse reference patterns (e.g., 'John 3:16'). No page content is collected, stored, or transmitted. Only matched reference strings are parsed locally."
   - "Is this data transmitted to a remote server?" → **No**
   - "Is this data being used for AI model training?" → **No**

**Note:** `all_frames: true` means the script also runs inside iframes (needed for Google Sites and other iframe-based pages). Mention this in the justification if asked: "Content script also runs in iframes to detect references in iframe-embedded content (e.g., Google Sites). No iframe content is collected or transmitted."

---

## Microsoft Edge Add-ons

1. Go to https://partner.microsoft.com/dashboard/microsoftedge
2. Upload the same `kjb-reader-v0.4.0-chrome.zip`
3. Same privacy practices as Chrome
4. Edge accepts Manifest V3 Chrome extensions directly

---

## Firefox Add-ons (AMO)

1. Go to https://addons.mozilla.org/developers/
2. Upload `kjb-reader-v0.4.0-firefox.zip`
3. Firefox uses `sidebar_action` instead of `side_panel` — the manifest includes both
4. Firefox uses `browser_specific_settings.gecko.id` for the extension ID
5. **Important:** Firefox's sidebar appears as a toggle button in the toolbar. Users click the KJB Reader icon to open the sidebar panel.
6. **Privacy policy:** Same as Chrome — all processing is local, no data transmitted
7. **Review:** Firefox AMO does a code review (automated + manual). Expect 1-5 days.

### Firefox-specific notes:
- Firefox 109+ supports Manifest V3
- `chrome.*` API namespace works in Firefox (aliased to `browser.*`)
- `sidebar_action.default_panel` replaces `side_panel.default_path`
- Firefox does NOT support `chrome.sidePanel` — the background script detects this and uses `browser.sidebarAction.open()` instead
- The extension ID is `kjb-reader@kingjamesbiblereader.com`

---

## Safari (macOS + iOS)

Safari does NOT have a sidebar API. The extension opens `sidebar.html` in a popup window instead.

### Requirements:
- Mac with Xcode 15+ installed
- Apple Developer account ($99/year from https://developer.apple.com)
- macOS 13+ (Safari 16+ for Web Extensions)

### Steps:

1. **Install `xcrun safari-web-extension-converter`:**
   ```bash
   # This tool comes with Xcode — no separate install needed
   xcrun safari-web-extension-converter /path/to/kjb-extension
   ```

2. **Convert the extension:**
   ```bash
   cd /path/to/
   xcrun safari-web-extension-converter kjb-extension \
     --project-location . \
     --app-name "KJB Reader" \
     --bundle-identifier com.kingjamesbiblereader.kjb-reader
   ```
   This creates an Xcode project with a macOS app wrapper around your extension.

3. **Open the Xcode project:**
   ```bash
   open "KJB Reader/KJB Reader.xcodeproj"
   ```

4. **Configure signing:**
   - Select the project in Xcode
   - Go to "Signing & Capabilities"
   - Select your Apple Developer team
   - Set bundle identifier to `com.kingjamesbiblereader.kjb-reader`

5. **Build and test:**
   - Press Cmd+R to build and run
   - Safari will open with the extension loaded
   - Enable it in Safari → Settings → Extensions
   - Test verse detection and sidebar popup

6. **Submit to App Store:**
   - Product → Archive
   - Upload to App Store Connect
   - Create App Store listing
   - Submit for review

### Safari behavior:
- Clicking the toolbar icon opens `sidebar.html` in a popup window (400×640)
- Content script detects verse references on web pages
- Context menu works for right-click verse lookup
- No persistent sidebar — the popup window is the UI

---

## Build Zips

The zips are pre-built in the kjb-extension folder:
- `kjb-reader-v0.4.0-chrome.zip` — for Chrome Web Store and Edge Add-ons
- `kjb-reader-v0.4.0-firefox.zip` — for Firefox AMO (same files, Firefox uses its own manifest fields)

Both zips contain identical files. Each browser uses its own manifest fields and ignores the other's.

---

## What Changed in v0.4.0

1. **`all_frames: true`** — Content script now runs inside iframes (fixes Google Sites, faithinthebloodministries.com, and other iframe-based pages)
2. **Firefox support** — Added `sidebar_action` and `browser_specific_settings` to manifest; background.js detects Firefox and uses `browser.sidebarAction.open()`
3. **Safari support** — Background.js falls back to popup window when no sidebar API is available
4. **Cross-browser background.js** — Detects browser type and uses appropriate sidebar API
