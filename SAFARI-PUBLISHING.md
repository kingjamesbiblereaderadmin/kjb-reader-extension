# KJB Reader — Safari Publishing Guide (v0.4.252)

Safari extensions are distributed through the Apple App Store, so the final
signed upload must happen on a Mac with Xcode. This zip is the fully
Safari-adapted web extension; the steps below turn it into an App Store
submission in about 30–60 minutes.

## What was adapted for Safari
- Removed the `sidePanel` permission and `side_panel` key (Safari has no
  side-panel API).
- Toolbar icon opens the full KJB Reader interface as a popup
  (`action.default_popup: sidebar.html`) — same proven path as Android.
- Verse clicks on web pages use the in-page overlay (same as Firefox/Opera/PWA).
- Context menu, hyphen-insensitive search, offline PCE engine, Copy All,
  print, and all other features are unchanged.

## Requirements (one-time)
1. A Mac with macOS 13+ and Xcode 15+ (free download from the App Store).
2. Apple Developer Program membership — USD 99/year — at developer.apple.com.
   (Xcode can run the extension locally for free; membership is only needed
   to publish.)

## Steps
1. Unzip `kjb-reader-safari-v0.4.252.zip` to a folder, e.g. ~/kjb-safari/
   (manifest.json must sit at the top of that folder — it does).
2. In Terminal:
   xcrun safari-web-extension-converter ~/kjb-safari \
     --app-name "KJB Reader" \
     --bundle-identifier com.kingjamesbiblereader.kjbreader \
     --no-open-xcode --force
   This creates an Xcode project with a containing app (required by Apple).
3. Open the generated .xcodeproj in Xcode:
   - Select your team under Signing & Capabilities (app + extension targets).
   - Set the app's display name, version 0.4.252, and a short description.
4. Test locally: Safari > Settings > Extensions (or Develop > Run Extensions
   Safety Tool), enable "KJB Reader". Verify: toolbar popup opens, verse
   clicks on any page paint the overlay, search works offline.
5. Product > Archive, then Distribute App > App Store Connect > Upload.
6. In App Store Connect: create the App Store listing, add screenshots
   (your existing promo PNGs work), paste the privacy-policy link
   (https://kingjamesbiblereader.com/privacy) and the changelog text.
7. Submit for review. First review of a Safari extension typically takes
   1–3 days.

## iOS note
The same Xcode project can build for iOS: set the iOS destination in
Xcode and upload. On iPhone, users get the reader via your App Store app
(Settings > Safari > Extensions), so include a small "how to enable"
section in the app listing.

## Listing notes
- Reviewers may ask why the extension needs "tabs"/"contextMenus"
  permissions — answer: verse-lookup context menu + reopening the reader
  for the active page. Both are core features.
- All data is local/offline; the extension makes no network requests.
