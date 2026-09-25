# KJB Reader — Opera Add-ons Changelog

All versions are backdated to their actual build dates.

---

**v0.4.273** — 2026-09-25
- Punctuation attached to a bracketed (italic) word now sits inside the brackets on screen and when copying, matching the source's own ":" and ";" convention.
- Updated the Verified KJB Preachers list with corrected and expanded links.

**v0.4.272** — 2026-09-23
- Allow Bible-reference detection only on the exact kingjamesbiblereader.com/extension test page while keeping other pages on that site excluded, including /extension-privacy.
- Includes combined apostrophe/Æ ligature search and long-result paging fixes since the previous recorded entry.

**v0.4.140** — 2026-08-16
- Added a scroll-to-top button in the Read and Results tabs. A small circular arrow appears in the bottom-right corner when scrolling past 200px; clicking smoothly scrolls back to the top.

**v0.4.139** — 2026-08-16
- WCAG 3:1 contrast safeguard for detected Bible references. If inherited host page text color fails contrast against the background, references automatically fall back to a high-contrast visible state (dark or light).

**v0.4.138** — 2026-08-16
- Fixed a race condition where `chrome.sidePanel.open()` would falsely trigger the in-page overlay fallback even when the side panel was already visible. The background now tracks panel state to route lookups directly.

**v0.4.137** — 2026-08-15
- Replaced zoom-based scaling with fluid CSS reflow. Tabs and content now wrap correctly across all viewport widths (300px–900px) and zoom levels (75%–150%).

**v0.4.136** — 2026-08-15
- Added "Cori" as an alias for "Corinthians" in Bible reference detection and sidebar lookup (e.g., "1 Cori 15:1-4" is now recognized).

**v0.4.135** — 2026-08-15
- Detected Bible references now inherit the host page's readable text color instead of forcing blue. Retains dotted underline, pointer cursor, and solid hover underline.

**v0.4.134** — 2026-08-15
- Switched to painted text ranges (non-DOM injection) for all browser reference detections. Prevents stale references and preserves page layout without modifying the DOM. Added Chrome Web Store v2 publisher script.

**v0.4.133** — 2026-08-15
- Preserved page layout for Bible references that span multiple HTML elements. References crossing font boundaries or character-spaced text are now detected correctly.

**v0.4.132** — 2026-08-15
- Added subtle styling to clickable verse references: dotted underline, pointer cursor, and solid underline on hover. Page styling is preserved for existing links.

**v0.4.131** — 2026-08-15
- Preserved host page styling for clickable verse references. Content script no longer overrides existing link styles or forces colors on detected references.

**v0.4.130** — 2026-08-15
- Stale content is now hidden while loading new verses. Prevents flash of previous chapter text during lookups.

**v0.4.129** — 2026-08-15
- Fixed Gospel reference navigation and cross-chapter range highlights. Highlights now persist correctly across chapters and books via a persistent highlight map.

**v0.4.128** — 2026-08-15
- Migrated extension to a copied KJB Reader API endpoint for improved reliability and self-hosted verse data.

**v0.4.127** — 2026-08-14
- Added Opera legacy `action` API callback compatibility alongside standard Promise-based methods. Edge mobile users can now open the extension UI from the browser menu without selecting a verse.

**v0.4.126** — 2026-08-14
- Added Firefox Android adaptive UI using a Manifest V2 event-page model. Desktop uses native sidebar; Android triggers a full-overlay interface. Resolved Mozilla linting warnings with zero errors.

**v0.4.125** — 2026-08-14
- Added resizable panel width (280–800px) via a left-edge drag grip with mouse, touch, and keyboard support. Added persistent A-/100%/A+ interface scaling controls that adjust text, icons, and spacing together.

**v0.4.124** — 2026-08-14
- Fixed overlay close button covering header actions on narrow screens. Added a dedicated 40px top toolbar for the close button, pushing the embedded sidebar content below.

**v0.4.123** — 2026-08-14
- Fixed Copy button overlapping verse text in result cards. Increased action gutter spacing and added safe text wrapping for narrow sidebar widths.

**v0.4.122** — 2026-08-13
- Audited and corrected all 66 Bible book titles against the live API. Fixed 19 mismatched fallback titles including Chronicles, Ezra, and Minor Prophets. Zero mismatches confirmed.

**v0.4.121** — 2026-08-13
- Fixed truncated book titles for 1–2 Samuel and 1–2 Kings. Updated local fallback map to use full KJV canonical titles (e.g., "The Second Book of the Kings").

**v0.4.120** — 2026-08-13
- Redesigned Results heading to a two-line layout: full book name on top, chapter number below, separated by an 8px gap. Removed dash separators.

**v0.4.119** — 2026-08-13
- Unified book title formatting between Read and Results modes. Standardized on API-provided full book names with local fallback. Reduced chapter heading font to 15px.

**v0.4.118** — 2026-08-13
- Added full KJV book titles to chapter headings in search results. Long titles now wrap correctly within the sidebar. Maintained Firefox compatibility by isolating unsupported APIs.

**v0.4.117** — 2026-08-13
- Created a dedicated Firefox-native background script (`background.firefox.js`) to remove all Chrome-specific `sidePanel` API references. Firefox now uses the native `sidebarAction` path exclusively.

**v0.4.116** — 2026-08-13
- Added 6px breathing room beneath the superscription divider in both Results and Read modes for improved readability.

**v0.4.115** — 2026-08-13
- Fixed four-digit verse number truncation in the parser. Highlight map now only includes verses confirmed by the API, preventing stale highlights for nonexistent references.

**v0.4.114** — 2026-08-13
- Fixed invalid chapter handling: nonexistent chapters (e.g., Psalm 200) now display a "not found" message instead of defaulting to Chapter 1. Updated parser to support four-digit verse numbers.

**v0.4.113** — 2026-08-13
- Normalized 404 error handling across single, multi-book, and cross-chapter verse lookups. Missing verses now display a clear "not found" message instead of empty cards or generic search failures.

**v0.4.112** — 2026-08-13
- Restored missing pilcrows in colophons. Increased spacing between the final verse and colophon block. Fixed rendering bug where invalid verses were hidden when chapter headers were present.

**v0.4.111** — 2026-08-13
- Standardized all verse and structural body text to 15px. Restored single pilcrows in colophons. Reduced colophon height for tighter layout.

**v0.4.110** — 2026-08-13
- Increased structural text width by reducing side padding to 14px. Separated action buttons onto a dedicated row to prevent heading overlap.

**v0.4.109** — 2026-08-13
- Removed background boxes and shading from structural text. Switched to clean divider lines with 16px typography for Hebrew names, superscriptions, and colophons.

**v0.4.108** — 2026-08-13
- Fixed off-center chapter headings caused by action button padding. Headings now center against the full card width.

**v0.4.107** — 2026-08-13
- Centered chapter headings and increased font size for superscriptions, names, and colophons to establish clearer typographic hierarchy.

**v0.4.106** — 2026-08-13
- Reverted Firefox to dual-mode overlay setup per user preference. Fixed hyperlink highlighting compatibility with split verse references.

**v0.4.105** — 2026-08-13
- Improved hyperlink-safe scanning to preserve original `href` destinations on detected references. Added native sidebar support for Firefox.

**v0.4.104** — 2026-08-13
- Unified plain-text scanning to detect Bible references across disparate HTML elements, font styles, and character-spaced text.

**v0.4.103** — 2026-08-13
- Unwrapped existing partial-match links before performing new reference detections to ensure Roman numerals and full book names are correctly identified.

**v0.4.102** — 2026-08-13
- PWA-detection mechanism to trigger in-page overlay fallback when the sidePanel API is unavailable in standalone window modes.

**v0.4.101** — 2026-08-13
- Added multi-book and cross-chapter reference lookup support with persistent highlight map across chapters and books.

**v0.4.100** — 2026-08-13
- Added SVG icons for interface elements to ensure theme-aware colors, replacing static emoji glyphs.

**v0.4.99** — 2026-08-13
- Limited interface to four main tabs: Results, Read, Gospel, and Resources. Removed history and favorites functionality.

**v0.4.98** — 2026-08-13
- Removed Highlighting tool from the extension interface.

**v0.4.97** — 2026-08-13
- Added Gospel tab with salvation resources and Resources tab with preacher links and ministry info.

**v0.4.96** — 2026-08-13
- Added "View in Sidebar" button to the popup for transitioning to the full side panel.

**v0.4.95** — 2026-08-13
- Implemented manifest-based side panel activation (openPanelOnActionClick) for manual browsing and popup windows for automated verse lookups.

**v0.4.94** — 2026-08-13
- Added right-click context menu for verse lookups on selected text.

**v0.4.93** — 2026-08-13
- Added advanced search with wildcard (? and *), whole-word match, case-sensitive toggle, and Old/New Testament filtering.

**v0.4.92** — 2026-08-13
- Added epistle subscriptions rendered as centered, bold, bracket-italicized text. Psalm superscriptions with leading pilcrow.

**v0.4.91** — 2026-08-13
- Excluded kingjamesbiblereader.com from content script execution to prevent self-detection loops.

**v0.4.90** — 2026-08-11
- Removed local legal pages (privacy.html, terms.html, contact.html). Centralized links to the KJB Reader website. Fixed double-panel issue caused by a 2-second timeout fallback.

**v0.4.89** — 2026-08-11
- Redirected privacy and terms links to website-hosted pages. Removed obsolete local legal files from the extension codebase.

**v0.4.88** — 2026-08-11
- Fixed broken Firefox sidebar legal links by pointing them to external website URLs. Standardized pronoun usage on privacy policy.

**v0.4.87** — 2026-08-10
- Updated extension branding to "KJB Reader - SidePanel" with official site icons.

**v0.4.86** — 2026-08-09
- Added local Privacy, Terms, and Contact pages synced with the website.

**v0.4.85** — 2026-08-09
- Implemented copy function with approximate visual centering for headers, bracketed notation for italics, and omission of periods after verse numbers.

**v0.4.84** — 2026-08-09
- Added printed page footer: "Printed from KJB Reader Web Extension — kingjamesbiblereader.com/extension".

**v0.4.83** — 2026-08-09
- Standardized "The" prefixes for all 66 KJV books in dropdowns and displays.

**v0.4.82** — 2026-08-09
- Added hand-drawn logo icon for extension branding.

**v0.4.81** — 2026-08-09
- Implemented black text for pilcrows at 16px to keep them clearly visible.

**v0.4.80** — 2026-08-09
- Rendered Hebrew section headings and superscriptions as centered, bold text positioned under the verse reference but above the verse text.

**v0.4.79** — 2026-08-09
- Added colophons placed at the end of the card as normal-weight text.

**v0.4.78** — 2026-08-09
- Applied italics to structural text (superscriptions and colophons) only when content is enclosed in brackets.

**v0.4.77** — 2026-08-09
- Used 16px font size for structural text (Hebrew names, superscriptions, colophons) with clean divider lines instead of bordered boxes.

**v0.4.76** — 2026-08-09
- Added a unified result-structural-box (bordered, rounded card) for Psalm Hebrew section headings, superscriptions, and colophons.

**v0.4.75** — 2026-08-09
- Included Psalm superscriptions and epistle colophons in search results with centered, bold pilcrow (¶) and italicized bracket formatting.

**v0.4.74** — 2026-08-09
- Added robust verse detection for varied formats including Roman numerals, ordinals, and references embedded within <a> tags.

**v0.4.73** — 2026-08-09
- Implemented unified plain-text scanning approach to detect Bible references across disparate HTML elements and font styles.

**v0.4.72** — 2026-08-09
- Added side panel for verse lookup and search functionalities.

**v0.4.71** — 2026-08-09
- Connected extension to KJB Reader app's API for verse lookup, advanced search, and reference detection.

**v0.4.70** — 2026-08-09
- Initial sidebar layout with stacked header, search strip, and tab bar.

**v0.4.69** — 2026-08-09
- Added compact spacing, restrained surfaces, light borders, and minimal decoration for side panel UI.

**v0.4.66** — 2026-08-09
- Implemented content script for auto-detection of Bible verse references on web pages.

**v0.4.65** — 2026-08-09
- Initial Opera build of KJB Reader extension with sidebar, verse lookup, search, and reference detection.
