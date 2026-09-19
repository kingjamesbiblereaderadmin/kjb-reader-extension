// KJB Reader content script — guarded against duplicate injection.
// reinjectContentScripts() in the background may inject this file into a tab
// that already has it (after an extension update); without this guard the
// top-level `const` declarations would throw "already declared".
const KJB_CONTENT_VERSION = "0.4.254";

// A plain boolean guard here was a serious bug: after an extension update the
// background re-injects this file into already-open tabs, and the boolean made
// the NEW script bail out — leaving the tab running the OLD code forever. Every
// fix shipped since re-injection was added silently did nothing in those tabs.
// Version-stamped instead: a newer script always takes over, and older
// instances mute themselves via kjbIsActiveInstance() below.
if (window.__kjbReaderContentVersion === KJB_CONTENT_VERSION) {
  console.log("[KJB Reader] v" + KJB_CONTENT_VERSION + " already active — duplicate injection ignored");
} else {
  if (window.__kjbReaderContentVersion) {
    console.log("[KJB Reader] taking over from stale content script v" +
      window.__kjbReaderContentVersion + " → v" + KJB_CONTENT_VERSION);
  }
  window.__kjbReaderContentVersion = KJB_CONTENT_VERSION;
  window.__kjbReaderContentLoaded = true;

  // Any overlay left behind by the outgoing instance is not ours to keep.
  try {
    const stale = document.getElementById("kjb-sidebar-overlay");
    if (stale) stale.remove();
  } catch (e) {}

// KJB Reader - Content Script
// Detects Bible verse references on web pages and makes them clickable.
// v0.4.58 — Cross-browser: Chrome sidePanel + Firefox sidebarAction + overlay fallback.

// --- Browser detection ---
// Chromium (Chrome 148 / Edge / Opera) now ALSO exposes a `browser` alias, so
// `typeof browser !== "undefined"` no longer identifies Firefox. That stale test
// made every Chromium verse click take the Firefox branch and inject the in-page
// overlay; only the suppression guard hid it, and whenever the guard lost the
// race the overlay appeared and was removed — the "flash".
// Gecko's UA always contains "Firefox/", Chromium's never does, and
// runtime.getBrowserInfo() is Gecko-only.
const isFirefox = /\bFirefox\/\d/.test(navigator.userAgent) ||
  (typeof browser !== "undefined" && !!browser.runtime &&
   typeof browser.runtime.getBrowserInfo === "function");
// Promise-style calls need the namespace that actually returns promises:
// Firefox's chrome.* is callback-based (chrome.storage.local.get(...).then(...)
// throws a TypeError there and silently aborts the caller), while browser.* is
// promise-based. Chromium's browser.* is only an alias, so it keeps chrome.*,
// whose MV3 APIs already return promises.
const kjbApi = (isFirefox && typeof browser !== "undefined" && browser.runtime) ? browser : chrome;

// --- PWA / standalone window detection ---
// In PWA windows (e.g., Facebook installed as app), the side panel UI doesn't exist.
// chrome.sidePanel.open() may resolve without actually showing anything.
// Detect this and handle verse lookups directly via the in-page overlay.
function detectStandalone() {
  try {
    // Only true installed-app contexts count. 'fullscreen' and 'minimal-ui'
    // were catastrophic false positives: an ordinary desktop window in F11
    // fullscreen matches display-mode: fullscreen, yet it still has a perfectly
    // good side panel. That single wrong bit made the extension treat a normal
    // tab as a PWA and force the in-page overlay.
    return window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: window-controls-overlay)').matches
      || (typeof navigator !== "undefined" && navigator.standalone === true);
  } catch (e) {
    return false;
  }
}
let isStandalone = detectStandalone();

// What kind of browser is this, according to the background (the page itself
// cannot see chrome.sidePanel)? null = not yet known.
let browserHasSidePanel = null;
function refreshCaps() {
  try {
    kjbApi.runtime.sendMessage({ type: "KJB_GET_CAPS" }).then((caps) => {
      if (caps && typeof caps.hasSidePanel === "boolean") {
        browserHasSidePanel = caps.hasSidePanel;
      }
    }).catch(() => {});
  } catch (e) {}
}
refreshCaps();

// FINAL GATE. Enforcement lives here, at the point where pixels would actually
// appear, instead of at each request site. On a browser that HAS a side panel
// and a tab that is not a real installed app, an in-page overlay is only ever
// legitimate as a last resort — when the popup window itself failed to open.
// Any other request is refused, whoever sent it.
function overlayAllowedHere(reason) {
  if (browserHasSidePanel !== true) return true;   // Opera/Firefox/unknown: overlay is the surface
  if (isStandalone) return true;                   // genuine PWA/mobile (detected locally)
  if (reason === "standalone") return true;        // background determined this tab is standalone
  if (reason === "window-failed") return true;     // nothing else left to try
  console.log('[KJB Reader] overlay REFUSED — this browser has a side panel (reason=' + reason + ')');
  return false;
}
try {
  console.log('[KJB Reader] display-mode probe →',
    'standalone:', window.matchMedia('(display-mode: standalone)').matches,
    '| wco:', window.matchMedia('(display-mode: window-controls-overlay)').matches,
    '| fullscreen:', window.matchMedia('(display-mode: fullscreen)').matches,
    '| minimal-ui:', window.matchMedia('(display-mode: minimal-ui)').matches,
    '| nav.standalone:', navigator.standalone);
} catch (e) {}
// Mobile browsers (Edge mobile, Kiwi, etc.) don't support sidePanel — always use overlay
const isMobile = /Android|iPhone|iPad|iPod|Windows Phone|Silk/i.test(navigator.userAgent)
  || (/Mobile/.test(navigator.userAgent) && !/Windows NT|Macintosh|X11|CrOS/.test(navigator.userAgent));
if (isMobile && !isStandalone) {
  isStandalone = true;
}

// Track whether the side panel is open.
// The background pushes KJB_PANEL_STATUS to all tabs when the panel opens/closes.
// We also ask the background on load for the initial state.
let panelOpen = false;
let lastOverlayInjectTs = 0;

// True only for the newest injected instance. A superseded instance keeps its
// listeners (they cannot be removed from outside) so it must refuse to act.
function kjbIsActiveInstance() {
  return window.__kjbReaderContentVersion === KJB_CONTENT_VERSION;
}

function overlayExists() {
  try { return !!document.getElementById("kjb-sidebar-overlay"); } catch (e) { return false; }
}

let lastHeartbeat = 0;
const HEARTBEAT_MAX_AGE = 6500;   // panel beats every 2s — allow 3 misses

function panelIsLive() {
  return Date.now() - lastHeartbeat < HEARTBEAT_MAX_AGE;
}

function refreshPanelState() {
  // Storage read only — never wakes the service worker.
  try {
    kjbApi.storage.local.get(["kjbPanelHeartbeat"]).then((data) => {
      lastHeartbeat = (data && data.kjbPanelHeartbeat) || 0;
      panelOpen = panelIsLive();
    }).catch(() => {});
  } catch (e) {}
}

// storage.onChanged fires directly in content scripts, so every heartbeat the
// panel writes updates us instantly — no messaging, no service worker. This
// keeps panelOpen accurate BEFORE a click, which is the only way to avoid the
// overlay being built and then taken away again.
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.kjbPanelHeartbeat) return;
    lastHeartbeat = changes.kjbPanelHeartbeat.newValue || 0;
    panelOpen = panelIsLive();
    if (panelOpen && Date.now() - lastOverlayInjectTs < 3000) {
      try { removeSidebarOverlay(); } catch (e) {}
    }
  });
} catch (e) {}

// Re-evaluate staleness so a closed panel is noticed even with no writes.
setInterval(() => { panelOpen = panelIsLive(); }, 1000);
refreshPanelState();
// Re-check whenever this tab regains attention — the user may have opened the
// side panel while another tab was focused.  Keeping panelOpen fresh BEFORE
// the click is what avoids an overlay flash.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshPanelState();
});
window.addEventListener("focus", refreshPanelState);

console.log('[KJB Reader] content.js v' + KJB_CONTENT_VERSION + ' loaded. Standalone/PWA:', isStandalone, '| Mobile:', isMobile, '| URL:', window.location.href);

// --- Bible book names (long and short forms) ---
const BOOK_NAMES = [
  // Full names
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
  "Joshua", "Judges", "Ruth", "Samuel", "Kings", "Chronicles",
  "Ezra", "Nehemiah", "Esther", "Job", "Psalm", "Psalms",
  "Proverbs", "Ecclesiastes", "Song of Solomon", "Song of Songs",
  "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel",
  "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah",
  "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi",
  "Matthew", "Mark", "Luke", "John", "Acts", "Romans",
  "Corinthians", "Galatians", "Ephesians", "Philippians",
  "Colossians", "Thessalonians", "Timothy", "Titus", "Philemon",
  "Hebrews", "James", "Peter", "Jude", "Revelation", "Apocalypse",
  // Standard abbreviations
  "Gen", "Exod", "Lev", "Num", "Deut", "Josh", "Judg", "Ruth",
  "Sam", "Kgs", "Chr", "Ezr", "Neh", "Esth", "Ps", "Pss",
  "Prov", "Eccl", "Song", "Sng", "Cant", "Isa", "Jer", "Lam",
  "Ezek", "Eze", "Dan", "Hos", "Joel", "Amos", "Obad", "Jon",
  "Mic", "Nah", "Hab", "Zeph", "Zep", "Hag", "Zech", "Zec", "Mal",
  "Matt", "Mk", "Lk", "Jn", "Joh", "Rom", "Cor", "Cori", "Gal", "Eph",
  "Phil", "Php", "Col", "Thess", "Tim", "Titus", "Tit", "Phlm", "Phm",
  "Heb", "Jas", "Jam", "Pet", "Jd", "Rev",
  // Ultra-short (2-letter)
  "Dt", "Lv", "Jdg"
];

// --- Book name normalization (abbreviation → full name) ---
const BOOK_FULL_NAMES = {
  "Genesis": "Genesis", "Gen": "Genesis",
  "Exodus": "Exodus", "Exod": "Exodus",
  "Leviticus": "Leviticus", "Lev": "Leviticus", "Lv": "Leviticus",
  "Numbers": "Numbers", "Num": "Numbers",
  "Deuteronomy": "Deuteronomy", "Deut": "Deuteronomy", "Dt": "Deuteronomy",
  "Joshua": "Joshua", "Josh": "Joshua",
  "Judges": "Judges", "Judg": "Judges", "Jdg": "Judges",
  "Ruth": "Ruth",
  "Samuel": "Samuel", "Sam": "Samuel",
  "Kings": "Kings", "Kgs": "Kings",
  "Chronicles": "Chronicles", "Chr": "Chronicles",
  "Ezra": "Ezra", "Ezr": "Ezra",
  "Nehemiah": "Nehemiah", "Neh": "Nehemiah",
  "Esther": "Esther", "Esth": "Esther",
  "Job": "Job",
  "Psalm": "Psalms", "Psalms": "Psalms", "Ps": "Psalms", "Pss": "Psalms",
  "Proverbs": "Proverbs", "Prov": "Proverbs",
  "Ecclesiastes": "Ecclesiastes", "Eccl": "Ecclesiastes",
  "Song of Solomon": "Song of Solomon", "Song of Songs": "Song of Solomon", "Song": "Song of Solomon", "Sng": "Song of Solomon", "Cant": "Song of Solomon",
  "Isaiah": "Isaiah", "Isa": "Isaiah",
  "Jeremiah": "Jeremiah", "Jer": "Jeremiah",
  "Lamentations": "Lamentations", "Lam": "Lamentations",
  "Ezekiel": "Ezekiel", "Ezek": "Ezekiel", "Eze": "Ezekiel",
  "Daniel": "Daniel", "Dan": "Daniel",
  "Hosea": "Hosea", "Hos": "Hosea",
  "Joel": "Joel",
  "Amos": "Amos",
  "Obadiah": "Obadiah", "Obad": "Obadiah",
  "Jonah": "Jonah", "Jon": "Jonah",
  "Micah": "Micah", "Mic": "Micah",
  "Nahum": "Nahum", "Nah": "Nahum",
  "Habakkuk": "Habakkuk", "Hab": "Habakkuk",
  "Zephaniah": "Zephaniah", "Zeph": "Zephaniah", "Zep": "Zephaniah",
  "Haggai": "Haggai", "Hag": "Haggai",
  "Zechariah": "Zechariah", "Zech": "Zechariah", "Zec": "Zechariah",
  "Malachi": "Malachi", "Mal": "Malachi",
  "Matthew": "Matthew", "Matt": "Matthew",
  "Mark": "Mark", "Mk": "Mark",
  "Luke": "Luke", "Lk": "Luke",
  "John": "John", "Jn": "John", "Joh": "John",
  "Acts": "Acts",
  "Romans": "Romans", "Rom": "Romans",
  "Corinthians": "Corinthians", "Cor": "Corinthians", "Cori": "Corinthians",
  "Galatians": "Galatians", "Gal": "Galatians",
  "Ephesians": "Ephesians", "Eph": "Ephesians",
  "Philippians": "Philippians", "Phil": "Philippians", "Php": "Philippians",
  "Colossians": "Colossians", "Col": "Colossians",
  "Thessalonians": "Thessalonians", "Thess": "Thessalonians",
  "Timothy": "Timothy", "Tim": "Timothy",
  "Titus": "Titus", "Tit": "Titus",
  "Philemon": "Philemon", "Phlm": "Philemon", "Phm": "Philemon",
  "Hebrews": "Hebrews", "Heb": "Hebrews",
  "James": "James", "Jas": "James", "Jam": "James",
  "Peter": "Peter", "Pet": "Peter",
  "Jude": "Jude", "Jd": "Jude",
  "Revelation": "Revelation", "Rev": "Revelation", "Apocalypse": "Revelation",
};

function normalizeBookName(rawBook) {
  let bookStr = rawBook.trim();
  let prefix = "";
  const prefixMatch = bookStr.match(/^(?:(\d)(?:st|nd|rd)|(I{1,3})|(\d))\s*/i);
  if (prefixMatch) {
    if (prefixMatch[1]) prefix = prefixMatch[1];
    else if (prefixMatch[2]) prefix = String(prefixMatch[2].length);
    else if (prefixMatch[3]) prefix = prefixMatch[3];
    bookStr = bookStr.slice(prefixMatch[0].length);
  }
  const base = bookStr.trim().replace(/\.+$/, "");
  let fullName = BOOK_FULL_NAMES[base] || BOOK_FULL_NAMES[base.charAt(0).toUpperCase() + base.slice(1).toLowerCase()];
  if (!fullName) {
    const ofMatch = base.match(/^(.+?)\s+of\s+/i);
    if (ofMatch) {
      fullName = BOOK_FULL_NAMES[ofMatch[1]] || BOOK_FULL_NAMES[ofMatch[1].charAt(0).toUpperCase() + ofMatch[1].slice(1).toLowerCase()];
      if (fullName && ofMatch[0].match(/solomon|songs/i)) {
        fullName = "Song of Solomon";
      }
    }
  }
  if (!fullName) return rawBook;
  return prefix ? `${prefix} ${fullName}` : fullName;
}

// Build regex for verse references
function buildVerseRegex() {
  const escaped = BOOK_NAMES.map(b => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a,b) => b.length - a.length);

  // Number prefix: ordinal (1st) before plain digit (1) to avoid backtracking
  const numPrefix = "(?:(?:\\d(?:st|nd|rd))|(?:I{1,3})|(?:[123]))\\s*";

  // Book name (group 1)
  const book = `((?:${numPrefix})?(?:${escaped.join("|")})\\.?(?:\\s+of\\s+(?:Solomon|Songs|the\\s+(?:Father|Lord|Almighty))?\\b)?)`;

  // Separator: either "ch."/"chap."/"chapter" marker, or just whitespace
  const sep = "(?:\\s+(?:ch|chap|chapter)\\.?\\s*|\\s+)";

  // Chapter with optional range (group 2): "3" or "1-3" or "1 to 3"
  const chRangeSep = "(?:\\s*[-\\u2013\\u2014\\u2011]\\s*|\\s+to\\s+|\\s+through\\s+)";
  const chapter = "(\\d{1,3}(?:" + chRangeSep + "\\d{1,3})?)";

  // Verse separator: colon with spaces, period before digit, or "v."/"verse"
  const verseSep = "(?:\\s*:\\s*|\\.(?=\\d)|\\s+(?:v|vv|verse)\\.?\\s+)";

  // Range separator: hyphens, en/em-dash, non-breaking hyphen, "to", "through", "and", "&"
  const rangeSep = "(?:\\s*[-\\u2013\\u2014\\u2011]\\s*|\\s+(?:to|through|and)\\s+|\\s*&\\s*)";

  // List separator: comma, semicolon, "&", "and"
  const listSep = "(?:\\s*[;,&]\\s*|\\s+and\\s+)(?!\\d+\\s+[A-Za-z])";

  // Verse number with optional ff/f suffix
  const verseNum = "\\d{1,3}(?:ff?\\.?)?";

  // Cross-chapter range end: optional Chapter:Verse, or just Verse
  const crossChapter = "(?:\\d{1,3}\\s*[:.]\\s*)?\\d{1,3}";

  // Full verse spec (group 3)
  // After a list separator, allow crossChapter (e.g. "8:1-2") in addition to plain verseNum
  const verseSpec = "(" + verseNum +
    "(?:" + rangeSep + crossChapter + ")?" +
    "(?:" + listSep + "(?:" + crossChapter + "|" + verseNum + ")" + "(?:" + rangeSep + crossChapter + ")?)*" +
  ")";

  return new RegExp(`\\b${book}${sep}${chapter}(?:${verseSep}${verseSpec})?`, "gi");
}

const VERSE_REGEX = buildVerseRegex();

// --- Skip these elements ---
function shouldSkipElement(el) {
  if (!el || !el.closest) return true;
  const skip = el.closest("SCRIPT, STYLE, NOSCRIPT, TEXTAREA, INPUT, BUTTON, KJB-LINK, .kjb-link, #kjb-sidebar-overlay, [contenteditable], [contenteditable=\"\"], [contenteditable=\"true\"]");
  if (skip) return true;
  if (el.classList && el.classList.contains("kjb-link")) return true;
  return false;
}

// --- Find all shadow roots recursively ---
function getAllShadowRoots(root) {
  const roots = [];
  if (!root || !root.querySelectorAll) return roots;
  const allEls = root.querySelectorAll("*");
  for (const el of allEls) {
    if (el.shadowRoot) {
      roots.push(el.shadowRoot);
      roots.push(...getAllShadowRoots(el.shadowRoot));
    }
  }
  return roots;
}

// ========================================================
// SIDEBAR OVERLAY (in-page iframe fallback)
// Side panel approach: storage delivers the verse, side panel picks it up
// ========================================================
let sidebarOverlay = null;
let sidebarOverlayCleanup = null;

// Is our extension context still alive? After an update, a content script left
// in an un-reloaded tab is an orphan: chrome.runtime.id becomes undefined and
// every call into the extension fails. An orphan must do NOTHING rather than
// paint an overlay it can no longer control — that is what previously appeared
// as a rogue overlay from a version that was already replaced.
function extensionAlive() {
  try { return !!(chrome && chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
}

let staleNoticeShown = false;
function showStaleNotice() {
  if (staleNoticeShown) return;
  staleNoticeShown = true;
  try {
    const n = document.createElement("div");
    n.id = "kjb-stale-notice";
    n.textContent = "KJB Reader was updated — reload this page to look up verses here.";
    n.setAttribute("style", [
      "position:fixed", "z-index:2147483647", "bottom:16px", "right:16px",
      "max-width:280px", "padding:10px 12px", "border-radius:8px",
      "font:13px/1.4 system-ui,sans-serif", "background:#1f2937", "color:#fff",
      "box-shadow:0 4px 14px rgba(0,0,0,.3)", "cursor:pointer"
    ].join(";"));
    n.addEventListener("click", () => n.remove());
    document.documentElement.appendChild(n);
    setTimeout(() => { try { n.remove(); } catch (e) {} }, 6000);
  } catch (e) {}
}

let overlayAuthorizedUntil = 0;
function injectSidebarOverlay(force) {
  if (!extensionAlive()) {
    console.log('[KJB Reader] orphaned content script — standing down instead of injecting');
    showStaleNotice();
    return;
  }
  // Mark this insertion as sanctioned by THIS version, so the DOM guard below
  // can tell it apart from one an orphaned script injected.
  overlayAuthorizedUntil = Date.now() + 5000;
  if (!kjbIsActiveInstance()) {
    console.log("[KJB Reader] stale instance refusing to inject overlay");
    return;
  }
  // Central guard. Every route into the overlay passes through here, so this
  // is the one place that can reliably stop a flash. Previous versions only
  // guarded the click handler, while the background had its own injection
  // path (sidePanel.open() failure -> KJB_INJECT_OVERLAY) that ignored it.
  if (!force && panelIsLive()) {
    console.log('[KJB Reader] overlay suppressed — side panel is live');
    return;
  }
  lastOverlayInjectTs = Date.now();
  console.log('[KJB Reader] injectSidebarOverlay called by v' + KJB_CONTENT_VERSION + '. force:', !!force,
    '| panelLive:', panelIsLive(), '\n', new Error().stack);
  // Remove existing overlay
  removeSidebarOverlay();

  console.log('[KJB Reader] Injecting overlay...');

  const container = document.createElement("div");
  container.id = "kjb-sidebar-overlay";
  container.setAttribute("style", [
    "position: fixed",
    "top: 0",
    "right: 0",
    "width: min(400px, 100vw)",
    // 100vh on mobile means the LARGEST viewport (chrome hidden), so the bottom
    // of the panel — read area and footer — sat underneath the browser bars.
    // dvh was the first attempt, but it tracks the chrome dynamically and while
    // an address bar is on screen (or mid show/hide) the bottom of the box is
    // still behind it. svh is the SMALL viewport — the height with the chrome
    // showing — so the overlay always fits and the footer stays reachable. The
    // cost is a thin gap under the overlay once the chrome auto-hides, which is
    // cosmetic; a hidden footer is not. vh stays first as the fallback.
    "height: 100vh",
    "height: 100svh",
    "z-index: 2147483647",
    "box-shadow: -4px 0 20px rgba(0,0,0,0.2)",
    "background: white",
    "border-left: 1px solid #ddd",
    "transition: transform 0.2s ease",
    // Built INVISIBLE on purpose. If anything decides this overlay was a
    // mistake (the side panel turns out to be open), it is removed before it
    // ever paints — so an inject-then-remove cycle cannot flash. This is the
    // structural fix: it holds no matter which code path did the injecting.
    "visibility: hidden",
  ].join(";") + ";");

  // Dedicated overlay toolbar. Keeping Close outside the iframe content flow
  // previously let it cover the embedded header's Open button at narrow widths.
  const overlayToolbar = document.createElement("div");
  overlayToolbar.setAttribute("style", [
    "height: 40px",
    "display: flex",
    "align-items: center",
    "justify-content: flex-end",
    "padding: 0 6px",
    "background: #fff",
    "border-bottom: 1px solid #ddd",
    "box-sizing: border-box",
  ].join(";") + ";");

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "\u2715";
  closeBtn.setAttribute("aria-label", "Close KJB Reader");
  closeBtn.setAttribute("title", "Close KJB Reader");
  closeBtn.setAttribute("style", [
    "width: 28px",
    "height: 28px",
    "display: flex",
    "align-items: center",
    "justify-content: center",
    "cursor: pointer",
    "font-size: 14px",
    "font-family: Arial, sans-serif",
    "color: #666",
    "background: #f0f0f0",
    "border: 1px solid #ddd",
    "border-radius: 4px",
    "padding: 0",
  ].join(";") + ";");
  closeBtn.addEventListener("click", removeSidebarOverlay);
  overlayToolbar.appendChild(closeBtn);
  container.appendChild(overlayToolbar);

  // The sidebar begins below the dedicated toolbar, so its own header and Open
  // controls always retain their full clickable area.
  const iframe = document.createElement("iframe");
  // ?ctx=overlay tells sidebar.js it is the in-page overlay, NOT the real
  // side panel, so it does not announce panel presence (which would make
  // the content script remove this very overlay).
  iframe.src = chrome.runtime.getURL("sidebar.html?ctx=overlay");
  iframe.setAttribute("style", "width:100%;height:calc(100% - 40px);border:none;display:block;");
  iframe.setAttribute("allow", "");
  container.appendChild(iframe);

  // Resize grip for the in-page/mobile overlay. Native browser side panels use
  // the browser's own divider; this fallback panel needs its own control.
  const resizeHandle = document.createElement("div");
  resizeHandle.setAttribute("role", "separator");
  resizeHandle.setAttribute("aria-label", "Resize KJB Reader panel");
  resizeHandle.setAttribute("aria-orientation", "vertical");
  resizeHandle.setAttribute("tabindex", "0");
  resizeHandle.setAttribute("title", "Drag to resize. Use arrow keys for small adjustments. Double-click to reset.");
  resizeHandle.setAttribute("style", [
    "position: absolute",
    "top: 0",
    "bottom: 0",
    "left: 0",
    "width: 14px",
    "display: flex",
    "align-items: center",
    "justify-content: center",
    "cursor: ew-resize",
    "touch-action: none",
    "z-index: 20",
    "outline-offset: 2px",
  ].join(";") + ";");

  const resizeGrip = document.createElement("div");
  resizeGrip.setAttribute("aria-hidden", "true");
  resizeGrip.setAttribute("style", [
    "width: 3px",
    "height: 52px",
    "background: #94a3b8",
    "border: 1px solid #fff",
    "border-radius: 3px",
    "box-shadow: 0 1px 3px rgba(0,0,0,0.2)",
    "pointer-events: none",
  ].join(";") + ";");
  resizeHandle.appendChild(resizeGrip);
  container.appendChild(resizeHandle);

  const widthLimits = () => {
    const viewportWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 400);
    const min = Math.min(280, viewportWidth);
    const max = Math.max(min, Math.min(800, viewportWidth));
    return { min, max };
  };

  const applyOverlayWidth = (requestedWidth, persist = false) => {
    const { min, max } = widthLimits();
    const numericWidth = Number(requestedWidth);
    const safeWidth = Number.isFinite(numericWidth) ? numericWidth : 400;
    const width = Math.round(Math.min(max, Math.max(min, safeWidth)));
    container.style.width = `${width}px`;
    resizeHandle.setAttribute("aria-valuemin", String(min));
    resizeHandle.setAttribute("aria-valuemax", String(max));
    resizeHandle.setAttribute("aria-valuenow", String(width));
    if (persist) {
      try {
        const saved = chrome.storage.local.set({ overlayPanelWidth: width });
        if (saved && typeof saved.catch === "function") saved.catch(() => {});
      } catch (_) {}
    }
    return width;
  };

  let dragStartX = 0;
  let dragStartWidth = 400;
  let previousCursor = "";

  const finishResize = (event) => {
    if (event && resizeHandle.hasPointerCapture && resizeHandle.hasPointerCapture(event.pointerId)) {
      resizeHandle.releasePointerCapture(event.pointerId);
    }
    iframe.style.pointerEvents = "";
    document.documentElement.style.cursor = previousCursor;
    applyOverlayWidth(container.getBoundingClientRect().width, true);
  };

  resizeHandle.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    dragStartX = event.clientX;
    dragStartWidth = container.getBoundingClientRect().width;
    previousCursor = document.documentElement.style.cursor;
    document.documentElement.style.cursor = "ew-resize";
    iframe.style.pointerEvents = "none";
    resizeHandle.setPointerCapture(event.pointerId);
  });

  resizeHandle.addEventListener("pointermove", (event) => {
    if (!resizeHandle.hasPointerCapture || !resizeHandle.hasPointerCapture(event.pointerId)) return;
    event.preventDefault();
    applyOverlayWidth(dragStartWidth + (dragStartX - event.clientX));
  });
  resizeHandle.addEventListener("pointerup", finishResize);
  resizeHandle.addEventListener("pointercancel", finishResize);

  resizeHandle.addEventListener("keydown", (event) => {
    const currentWidth = container.getBoundingClientRect().width;
    let requestedWidth = null;
    if (event.key === "ArrowLeft") requestedWidth = currentWidth + 24;
    if (event.key === "ArrowRight") requestedWidth = currentWidth - 24;
    if (event.key === "Home") requestedWidth = widthLimits().min;
    if (event.key === "End") requestedWidth = widthLimits().max;
    if (requestedWidth === null) return;
    event.preventDefault();
    applyOverlayWidth(requestedWidth, true);
  });

  resizeHandle.addEventListener("dblclick", () => applyOverlayWidth(400, true));

  const handleViewportResize = () => applyOverlayWidth(container.getBoundingClientRect().width);
  window.addEventListener("resize", handleViewportResize);
  sidebarOverlayCleanup = () => {
    window.removeEventListener("resize", handleViewportResize);
    iframe.style.pointerEvents = "";
    document.documentElement.style.cursor = previousCursor;
  };

  document.documentElement.appendChild(container);
  sidebarOverlay = container;

  // Final say on whether this overlay is allowed to become visible.
  const revealOverlay = () => {
    if (!container.isConnected) return;
    if (!force && panelIsLive()) {
      console.log('[KJB Reader] overlay cancelled before paint — panel is live');
      removeSidebarOverlay();
      return;
    }
    container.style.visibility = "visible";
  };
  // Give the panel one beat-window to prove it is alive before we show
  // anything. Surfaces that have no side panel at all reveal immediately.
  if (force || isFirefox) {
    revealOverlay();
    return;
  }

  // A stale heartbeat does NOT prove the panel is closed: Chrome throttles
  // timers in the side panel document (treated as hidden while the user works
  // in the page), stretching the 2s beat to as much as once a minute. That is
  // what kept letting the overlay through. Messages are never throttled, so
  // ask for proof and stay hidden until we get an answer.
  try {
    kjbApi.storage.local.get(["kjbPanelHeartbeat", "kjbSidePanelOpen"]).then((d) => {
      const hb = (d && d.kjbPanelHeartbeat) || 0;
      if (Date.now() - hb < HEARTBEAT_MAX_AGE) {
        lastHeartbeat = hb;
        panelOpen = true;
        console.log('[KJB Reader] overlay cancelled — fresh heartbeat on re-read');
        removeSidebarOverlay();
      } else if (d && d.kjbSidePanelOpen) {
        console.log('[KJB Reader] heartbeat stale but panel flag set — awaiting proof');
      }
    }).catch(() => {});
  } catch (e) {}

  // The verse we just sent makes a live panel beat + announce within a few ms,
  // which cancels this still-invisible overlay. 600ms is comfortably enough for
  // that round trip while staying imperceptible when no panel is there.
  setTimeout(revealOverlay, 600);
  applyOverlayWidth(400);
  try {
    chrome.storage.local.get(["overlayPanelWidth"], (data) => {
      if (container.isConnected && data && data.overlayPanelWidth) {
        applyOverlayWidth(data.overlayPanelWidth);
      }
    });
  } catch (_) {}
  console.log('[KJB Reader] Overlay injected successfully. Container in DOM:', !!document.getElementById('kjb-sidebar-overlay'));
}

function removeSidebarOverlay() {
  if (sidebarOverlayCleanup) {
    sidebarOverlayCleanup();
    sidebarOverlayCleanup = null;
  }
  const existing = document.getElementById("kjb-sidebar-overlay");
  if (existing) existing.remove();
  sidebarOverlay = null;
}

// ========================================================
// NON-DOM VERSE HIGHLIGHTS
// Current browsers can paint and hit-test text ranges without inserting nodes.
// This keeps React/SPA renderers in full control of their own DOM and prevents
// stale references from surviving chapter or route changes.
// ========================================================
const supportsKjbTextHighlights = Boolean(
  typeof CSS !== "undefined" && CSS.highlights && typeof Highlight !== "undefined"
);
let kjbHighlightEntries = [];
let kjbHighlightDocuments = new Set();
// Each physical match on the page gets its own id, shared only by the
// segments of THAT occurrence (e.g. a reference wrapped across a line
// break). Grouping hit-tests and hover bounds by this — instead of by the
// matched reference text — matters because the same reference (e.g.
// "Romans 3:25") can legitimately appear more than once on one page, in
// unrelated places. Grouping by text alone previously treated every
// occurrence of the same reference as one combined region and filled in
// the entire gap between them as a hit/hover zone, so links, buttons, and
// plain text sitting between two mentions of the same verse would
// wrongly trigger the panel.
let kjbOccurrenceSeq = 0;
let kjbHoveredEntry = null;
let savedRootCursor = null;

function clearKjbTextHighlights() {
  // Restore any cursor override before replacing the active ranges.
  if (kjbHoveredEntry || savedRootCursor !== null) setKjbHoverEntry(null);
  for (const doc of kjbHighlightDocuments) {
    try {
      doc.defaultView.CSS.highlights.delete("kjb-verse-links");
      doc.defaultView.CSS.highlights.delete("kjb-verse-link-hover");
    } catch (_) {}
  }
  kjbHighlightDocuments.clear();
  kjbHighlightEntries = [];
  kjbHoveredEntry = null;
}

function addKjbTextHighlight(node, startOffset, endOffset, ref, occId) {
  if (!supportsKjbTextHighlights || !node || startOffset >= endOffset) return false;
  try {
    const range = node.ownerDocument.createRange();
    range.setStart(node, startOffset);
    range.setEnd(node, endOffset);
    kjbHighlightEntries.push({ range, ref, occId, doc: node.ownerDocument });
    kjbHighlightDocuments.add(node.ownerDocument);
    return true;
  } catch (_) {
    return false;
  }
}

function renderKjbTextHighlights() {
  if (!supportsKjbTextHighlights) return;
  for (const doc of kjbHighlightDocuments) {
    try {
      const ranges = kjbHighlightEntries
        .filter(entry => entry.doc === doc && entry.range.startContainer.isConnected)
        .map(entry => entry.range);
      if (ranges.length) {
        doc.defaultView.CSS.highlights.set("kjb-verse-links", new doc.defaultView.Highlight(...ranges));
      }
    } catch (_) {}
  }
}

function findKjbHighlightAtPoint(x, y) {
  if (!supportsKjbTextHighlights) return null;
  const padX = 8;   // horizontal padding around text
  const padY = 5;   // vertical padding around text

  // Group entries by occurrence — so a reference split across text nodes
  // (e.g. "John" in one node and "3:16" in another, from the same match) is
  // treated as one unified hit region — but NOT grouped with an unrelated,
  // separate occurrence of the same reference text elsewhere on the page.
  const groups = new Map();
  for (const entry of kjbHighlightEntries) {
    if (!entry.range.startContainer.isConnected) continue;
    const key = entry.occId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  // Iterate groups in reverse order (last-painted = topmost).
  const refKeys = Array.from(groups.keys()).reverse();
  for (const key of refKeys) {
    const entries = groups.get(key);

    // Collect ALL rects from ALL segments of this reference.
    const allRects = [];
    for (const entry of entries) {
      for (const r of entry.range.getClientRects()) allRects.push(r);
    }
    if (allRects.length === 0) continue;

    // Sort by top, then left.
    const sorted = allRects.slice().sort((a, b) => a.top - b.top || a.left - b.left);

    // Overall bounding rect (expanded).
    const bounds = {
      left: Math.min(...sorted.map(r => r.left)) - padX,
      right: Math.max(...sorted.map(r => r.right)) + padX,
      top: sorted[0].top - padY,
      bottom: sorted[sorted.length - 1].bottom + padY,
    };

    // Quick reject: if outside the overall bounding rect, skip.
    if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) continue;

    // Check each expanded rect.
    let hit = false;
    for (const r of sorted) {
      if (x >= r.left - padX && x <= r.right + padX &&
          y >= r.top - padY && y <= r.bottom + padY) {
        hit = true;
        break;
      }
    }

    // Check gaps between consecutive rects (line gaps + segment gaps).
    if (!hit) {
      for (let j = 0; j < sorted.length - 1 && !hit; j++) {
        const r = sorted[j];
        const next = sorted[j + 1];
        // Horizontal gap between segments on the same line.
        if (Math.abs(r.top - next.top) < 2) {
          if (y >= r.top - padY && y <= r.bottom + padY &&
              x >= r.left - padX && x <= next.right + padX) {
            hit = true;
          }
        }
        // Vertical gap between lines.
        if (next.top > r.bottom) {
          if (y >= r.bottom && y <= next.top &&
              x >= Math.min(r.left, next.left) - padX &&
              x <= Math.max(r.right, next.right) + padX) {
            hit = true;
          }
        }
      }
    }

    // No bounding box fallback — only accept clicks that land on (or are
    // padded very near) the actual painted text rects or their line gaps.
    // The old `if (!hit) hit = true;` was too aggressive and intercepted
    // clicks on nearby buttons, dropdowns, and close (X) controls.

    if (hit) return entries[0];
  }
  return null;
}

// --- Text-position-based hit detection ---
// Uses caretRangeFromPoint / caretPositionFromPoint to find the actual text
// node at a coordinate, then checks if it falls inside any stored highlight
// range. This is more reliable than getClientRects() for detecting clicks on
// text that spans elements, has CSS transforms, or sits in flex/grid layouts.
function findKjbHighlightByTextPoint(x, y) {
  if (!supportsKjbTextHighlights) return null;

  // Get the text position at the click point.
  let caretRange = null;
  if (document.caretRangeFromPoint) {
    caretRange = document.caretRangeFromPoint(x, y);
  } else if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y);
    if (pos && pos.offsetNode) {
      caretRange = document.createRange();
      caretRange.setStart(pos.offsetNode, pos.offset);
      caretRange.setEnd(pos.offsetNode, pos.offset);
    }
  }
  if (!caretRange || !caretRange.startContainer) return null;

  const clickNode = caretRange.startContainer;
  const clickOffset = caretRange.startOffset;

  // Check each highlight entry — does the click position fall inside it?
  for (let i = kjbHighlightEntries.length - 1; i >= 0; i--) {
    const entry = kjbHighlightEntries[i];
    if (!entry.range.startContainer.isConnected) continue;

    try {
      // Check if the click position is inside this range.
      if (entry.range.isPointInRange(clickNode, clickOffset)) return entry;

      // Also check slightly before and after (clicks on the boundary of a
      // text node might report an offset that's just outside the range).
      if (clickOffset > 0 && entry.range.isPointInRange(clickNode, clickOffset - 1)) return entry;
      if (entry.range.isPointInRange(clickNode, clickOffset + 1)) return entry;
    } catch (_) {}

    // REMOVED: the old "clickNode.contains(refContainer)" fallback was too
    // broad — clicking anywhere on a large container (div, section, article)
    // that happened to contain a verse reference text node somewhere inside
    // would trigger a false verse lookup. isPointInRange with ±1 offset
    // tolerance is sufficient for legitimate verse clicks.
  }

  return null;
}

function setKjbHoverEntry(entry) {
  if (!supportsKjbTextHighlights || entry === kjbHoveredEntry) return;
  kjbHoveredEntry = entry;
  try {
    CSS.highlights.delete("kjb-verse-link-hover");
    if (entry) {
      // Highlight ALL segments of this same occurrence so the entire
      // reference shows the hover underline at once — grouped by occId,
      // not ref text, so an unrelated repeat of the same reference
      // elsewhere on the page doesn't light up too.
      const ranges = kjbHighlightEntries
        .filter(e => e.occId === entry.occId && e.range.startContainer.isConnected)
        .map(e => e.range);
      if (ranges.length) CSS.highlights.set("kjb-verse-link-hover", new Highlight(...ranges));
    }
  } catch (_) {}

  const root = document.documentElement;
  if (entry && savedRootCursor === null) {
    savedRootCursor = {
      value: root.style.getPropertyValue("cursor"),
      priority: root.style.getPropertyPriority("cursor"),
    };
    root.style.setProperty("cursor", "pointer", "important");
  } else if (!entry && savedRootCursor !== null) {
    if (savedRootCursor.value) root.style.setProperty("cursor", savedRootCursor.value, savedRootCursor.priority);
    else root.style.removeProperty("cursor");
    savedRootCursor = null;
  }
}

// ========================================================
// VERSE LINK CREATION + CLICK HANDLING
// ========================================================

function handleVerseClick(ref, link) {
  if (!kjbIsActiveInstance()) {
    console.log("[KJB Reader] stale instance v" + KJB_CONTENT_VERSION + " ignoring click");
    return;
  }
  const ts = Date.now();
  kjbApi.storage.local.set({ pendingLookup: ref, lookupTimestamp: ts }).catch(() => {});

  // Hand the verse to the background, which relays it to whichever surface is
  // listening — the real side panel AND/OR an already-open overlay iframe.
  const notify = () => {
    try {
      kjbApi.runtime.sendMessage({
        type: "KJB_OPEN_LOOKUP",
        text: ref,
        standalone: isStandalone,
        userAgent: navigator.userAgent
      }).then((resp) => {
        // Learn the browser type from the reply, so the final gate is never
        // deciding on unknown capabilities when the fallback arrives.
        if (resp && typeof resp.hasSidePanel === "boolean") {
          browserHasSidePanel = resp.hasSidePanel;
        }
      }).catch(() => {});
    } catch (e) {}
  };

  console.log('[KJB Reader] Verse clicked:', ref,
    '| panelOpen:', panelOpen, '| overlay:', overlayExists());

  // (A) An overlay is already on screen — REUSE it. Never tear it down and
  // rebuild it: destroying the iframe is what produced a white "flash"
  // instead of the sidebar's own loading animation.
  if (overlayExists()) {
    console.log('[KJB Reader] → reusing existing overlay');
    notify();
    return;
  }

  // Firefox has no Chrome side panel to clash with, so it may inject at once.
  if (isFirefox) {
    console.log('[KJB Reader] → overlay (Firefox)');
    injectSidebarOverlay();
    notify();
    return;
  }
  // Standalone/PWA/mobile no longer inject here. The background already knows
  // this tab is standalone (KJB_STANDALONE_MODE) and will send a forced overlay
  // if — and only if — no side panel answers. One decision, one place.

  // (B) Cached state says the panel is open — go straight there, no overlay.
  if (panelOpen) {
    console.log('[KJB Reader] → side panel (cached)');
    notify();
    return;
  }

  // (C) On Chrome/Edge a verse click NEVER injects an overlay any more.
  //
  // Every attempt to decide "is the side panel open?" from the page failed,
  // because there is no signal here that is both instant and trustworthy:
  // storage flags go stale, ports die with the service worker, and the panel's
  // heartbeat timer gets throttled. Guessing wrong meant injecting an overlay
  // that something else then removed — the flash.
  //
  // So the page no longer decides. The verse goes to the background, which
  // knows for certain whether the panel consumed it, and picks the fallback
  // surface itself (a popup window on Chrome/Edge, an overlay only where no
  // side panel exists). An in-page overlay cannot appear from a verse click,
  // so it cannot flash.
  notify();
  console.log('[KJB Reader] → background decides (panel, else popup window)');
}


function createKjbLink(displayText, ref) {
  const link = document.createElement("kjb-link");
  link.className = "kjb-link";
  link.textContent = displayText;
  link.dataset.ref = ref || displayText;
  link.title = "Look up " + (ref || displayText) + " in KJB Reader";

  // Inline click handler — directly on the element for maximum reliability
  // (survives Google Sites' event interception that may block document-level handlers)
  link.addEventListener("click", function(e) {
    e.preventDefault();
    e.stopPropagation();
    handleVerseClick(link.dataset.ref, link);
  });

  return link;
}

// Wrap each text-node portion of a reference in place. A reference can span
// multiple styled/layout elements (for example, "John" and "Chapter 2").
// Keeping every segment under its original parent preserves the host DOM and
// prevents headings, columns, and inline styles from being restructured.
function wrapMappedTextSegments(textNodes, start, end, ref) {
  let wrapped = 0;
  // One id for this whole match — every text-node segment it gets split
  // across below (e.g. because the match line-wraps) shares it, so later
  // hit-testing knows they're one physical occurrence.
  const occId = kjbOccurrenceSeq++;
  for (let i = textNodes.length - 1; i >= 0; i--) {
    const entry = textNodes[i];
    const node = entry.node;
    if (!node || !node.isConnected) continue;

    const segmentStart = Math.max(start, entry.start);
    const segmentEnd = Math.min(end, entry.end);
    if (segmentStart >= segmentEnd) continue;

    const localStart = segmentStart - entry.start;
    const localEnd = segmentEnd - entry.start;
    if (localStart < 0 || localEnd > node.nodeValue.length) continue;

    if (supportsKjbTextHighlights) {
      if (addKjbTextHighlight(node, localStart, localEnd, ref, occId)) wrapped++;
      continue;
    }

    // Legacy fallback: splitText leaves the original prefix node connected, so
    // reverse-order wrapping remains safe when matches share one text node.
    const matchedNode = node.splitText(localStart);
    matchedNode.splitText(localEnd - localStart);
    const link = createKjbLink(matchedNode.nodeValue, ref);
    matchedNode.replaceWith(link);
    wrapped++;
  }
  return wrapped;
}

// --- Walk text nodes and highlight verse references ---
function processTextNodes(root) {
  if (!root) return 0;
  let count = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || node.nodeValue.trim().length < 3) return NodeFilter.FILTER_REJECT;
      if (shouldSkipElement(node.parentElement)) return NodeFilter.FILTER_REJECT;

      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const nodes = [];
  let node;
  while ((node = walker.nextNode())) nodes.push(node);

  nodes.forEach(node => {
    const text = node.nodeValue;
    VERSE_REGEX.lastIndex = 0;
    if (!VERSE_REGEX.exec(text)) return;

    if (supportsKjbTextHighlights) {
      VERSE_REGEX.lastIndex = 0;
      let highlightMatch;
      while ((highlightMatch = VERSE_REGEX.exec(text)) !== null) {
        if (addKjbTextHighlight(node, highlightMatch.index, highlightMatch.index + highlightMatch[0].length, normalizeRef(highlightMatch))) count++;
      }
      return;
    }

    VERSE_REGEX.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let lastEnd = 0;
    let m;
    while ((m = VERSE_REGEX.exec(text)) !== null) {
      if (m.index > lastEnd) frag.appendChild(document.createTextNode(text.slice(lastEnd, m.index)));
      // Preserve the page's exact visible wording; normalize only the hidden
      // lookup payload (for example, visible "I Chronicles" looks up "1 Chronicles").
      const normalizedRef = normalizeRef(m);
      frag.appendChild(createKjbLink(m[0], normalizedRef));
      count++;
      lastEnd = m.index + m[0].length;
    }
    if (lastEnd < text.length) frag.appendChild(document.createTextNode(text.slice(lastEnd)));
    if (node.parentNode) node.parentNode.replaceChild(frag, node);
  });

  if (count > 0) console.log("[KJB] processTextNodes found", count, "references");
return count;
}

// --- Highlight references inside existing hyperlinks without replacing the <a> ---
// The general scanner skips anchors to preserve their href and site behaviour.
// This dedicated pass keeps the original anchor, and replaces only the matched
// verse text with a clickable KJB-LINK. It also supports references split across
// styled child nodes inside the same hyperlink.
function processHyperlinkReferences(root) {
  if (!root || !root.querySelectorAll) return 0;
  let count = 0;

  for (const anchor of root.querySelectorAll('a[href]')) {
    if (shouldSkipElement(anchor) || anchor.querySelector('kjb-link.kjb-link')) continue;

    const doc = anchor.ownerDocument || document;
    const walker = doc.createTreeWalker(anchor, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || node.nodeValue.trim().length < 1) return NodeFilter.FILTER_REJECT;
        if (shouldSkipElement(node.parentElement)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const textNodes = [];
    let combinedText = '';
    let node;
    while ((node = walker.nextNode())) {
      textNodes.push({ node, start: combinedText.length, end: combinedText.length + node.nodeValue.length });
      combinedText += node.nodeValue;
    }
    if (combinedText.length < 3) continue;

    const matches = [];
    VERSE_REGEX.lastIndex = 0;
    let match;
    while ((match = VERSE_REGEX.exec(combinedText)) !== null) {
      matches.push({ ref: normalizeRef(match), start: match.index, end: match.index + match[0].length });
    }

    // Also detect character-spaced references across styled anchor children.
    const { normalized, normToOrig } = normalizeSpacedText(combinedText);
    if (normalized !== combinedText) {
      VERSE_REGEX.lastIndex = 0;
      while ((match = VERSE_REGEX.exec(normalized)) !== null) {
        const start = normToOrig[match.index] ?? match.index;
        const end = (normToOrig[match.index + match[0].length - 1] ?? (match.index + match[0].length - 1)) + 1;
        if (!matches.some(existing => start < existing.end && end > existing.start)) {
          matches.push({ ref: normalizeRef(match), start, end });
        }
      }
    }

    matches.sort((a, b) => b.start - a.start);
    for (const item of matches) {
      let startNode = null, startOffset = 0, endNode = null, endOffset = 0;
      for (const entry of textNodes) {
        if (!startNode && entry.end > item.start) {
          startNode = entry.node;
          startOffset = Math.max(0, item.start - entry.start);
        }
        if (entry.end >= item.end) {
          endNode = entry.node;
          endOffset = Math.min(entry.node.nodeValue.length, item.end - entry.start);
          break;
        }
      }
      if (!startNode || !endNode || !startNode.isConnected || !endNode.isConnected) continue;

      try {
        if (wrapMappedTextSegments(textNodes, item.start, item.end, item.ref) > 0) count++;
      } catch (err) {
        console.debug('[KJB Reader] Could not highlight linked reference:', err);
      }
    }
  }

  if (count > 0) console.log('[KJB] processHyperlinkReferences found', count, 'references');
  return count;
}

// --- Process same-origin iframes ---
function processIframes() {
  const iframes = document.querySelectorAll("iframe");
  for (const iframe of iframes) {
    if (iframe.id === "kjb-sidebar-overlay") continue; // Skip our own overlay
    let iframeDoc = null;
    try {
      iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    } catch (e) { continue; }
    if (!iframeDoc || !iframeDoc.body) {
      iframe.addEventListener("load", () => {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow?.document;
          if (doc && doc.body) {
            unwrapKjbLinks(doc.body);
            processHyperlinkReferences(doc.body);
            processAsPlainText(doc.body);
            processTextNodes(doc.body);
            getAllShadowRoots(doc.body).forEach(sr => { unwrapKjbLinks(sr); processHyperlinkReferences(sr); processAsPlainText(sr); processTextNodes(sr); });
          }
        } catch (e) {}
      });
      continue;
    }
    unwrapKjbLinks(iframeDoc.body);
    processHyperlinkReferences(iframeDoc.body);
    processAsPlainText(iframeDoc.body);
    getAllShadowRoots(iframeDoc.body).forEach(sr => { unwrapKjbLinks(sr); processHyperlinkReferences(sr); processAsPlainText(sr); processTextNodes(sr); });
    try {
      const obs = new MutationObserver(() => {
        clearTimeout(iframe._kjbTimer);
        iframe._kjbTimer = setTimeout(() => {
          unwrapKjbLinks(iframeDoc.body);
          processHyperlinkReferences(iframeDoc.body);
          processAsPlainText(iframeDoc.body);
          getAllShadowRoots(iframeDoc.body).forEach(s => { unwrapKjbLinks(s); processHyperlinkReferences(s); processAsPlainText(s); processTextNodes(s); });
        }, 300);
      });
      obs.observe(iframeDoc.body, { childList: true, subtree: true });
    } catch (e) {}
  }
}

// --- Normalize reference ---
function normalizeRef(match) {
  const book = normalizeBookName(match[1]);
  let chapter = match[2] || "";
  let verseSpec = match[3] || "";

  // Normalize word separators to hyphens (for ranges) or commas (for lists)
  const normalizeSeparators = (s) => {
    return s
      .replace(/\s+to\s+/gi, "-")      // "to" → hyphen (range)
      .replace(/\s+through\s+/gi, "-")  // "through" → hyphen (range)
      .replace(/\s+and\s+/gi, ",")     // "and" → comma (list)
      .replace(/\s*&\s*/g, ",")         // "&" → comma (list)
      .replace(/;/g, ",")                // semicolon → comma
      .replace(/[\u2013\u2014\u2011]/g, "-") // en/em-dash, non-breaking hyphen → hyphen
      .replace(/ff?\.?/gi, "")          // strip "ff"/"f" suffix
      .replace(/\s+/g, "");             // remove whitespace
  };

  chapter = normalizeSeparators(chapter);
  verseSpec = normalizeSeparators(verseSpec);
  return `${book} ${chapter}${verseSpec ? ":" + verseSpec : ""}`;
}

// --- Staleness guard for text-highlight ranges ---
// In virtualized message lists (Facebook Messenger, chat apps) the app
// reuses an existing Text node in place for brand-new message content
// instead of removing/re-inserting it. entry.range.startContainer stays
// .isConnected (same node object) even though its text is now completely
// different, so the range's stored offsets silently drift onto unrelated
// text — the highlight's rects then render wherever that content NOW sits,
// which can be a whole different message bubble with no verse in it at all.
// Re-confirm the range's LIVE text still parses to the same reference it
// was created for before treating it as a real hit.
function isKjbEntryStillValid(entry) {
  if (!entry || !entry.range) return false;
  try {
    if (!entry.range.startContainer.isConnected) return false;
    const liveText = entry.range.toString();
    if (!liveText || !liveText.trim()) return false;
    VERSE_REGEX.lastIndex = 0;
    const m = VERSE_REGEX.exec(liveText);
    if (!m) return false;
    return normalizeRef(m) === entry.ref;
  } catch (_) {
    return false;
  }
}

// --- mousedown handler: prevent text selection when clicking on a verse ref ---
// Without this, a slight mouse movement between mousedown and mouseup causes
// the browser to start a text selection, which swallows the click event and
// makes the user have to click multiple times.
let kjbLastHitEntry = null;
function findKjbHit(x, y) {
  // Try geometric detection first (covers padded area around text).
  let entry = findKjbHighlightAtPoint(x, y);
  if (entry && isKjbEntryStillValid(entry)) return entry;
  // Fall back to text-position detection (handles dead zones, transforms).
  entry = findKjbHighlightByTextPoint(x, y);
  if (entry && isKjbEntryStillValid(entry)) return entry;
  return null;
}
// Returns true if the event target is (or is inside) an interactive element
// like a button, select, input, textarea, or ARIA role="button". We skip
// verse detection in that case so the control works normally.
function isInteractiveTarget(e) {
  const el = e.target;
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  // Only block clicks on genuinely interactive controls — NOT on text that
  // happens to be inside a container with tabindex/onclick/data-* (those
  // are ubiquitous on Facebook, React apps, Bootstrap sites, etc. and
  // would silently swallow every verse click).
  // [contenteditable] is included so clicking into a compose box (Facebook
  // Messenger, TikTok comments, etc.) always focuses it normally, even if a
  // verse-highlight hit area happens to geometrically overlap that spot —
  // otherwise mousedown's preventDefault below blocks focus entirely and
  // the box becomes untypable.
  const interactive = el.closest(
    'button, select, input, textarea, summary, [role="button"], [role="combobox"], [role="listbox"], [role="menuitem"], [role="tab"], [contenteditable], [contenteditable="true"], [contenteditable=""]'
  );
  return !!interactive;
}

document.addEventListener("mousedown", (e) => {
  if (supportsKjbTextHighlights) {
    if (isInteractiveTarget(e)) return; // let buttons/dropdowns work
    const entry = findKjbHit(e.clientX, e.clientY);
    kjbLastHitEntry = entry;
    if (entry) e.preventDefault(); // prevent text selection so click fires
    return;
  }
  const path = e.composedPath();
  const link = path.find(el =>
    el.tagName === "KJB-LINK" || (el.classList && el.classList.contains("kjb-link"))
  );
  if (link) e.preventDefault();
}, true);

// --- Document-level click handler ---
document.addEventListener("click", (e) => {
  if (supportsKjbTextHighlights) {
    if (isInteractiveTarget(e)) { kjbLastHitEntry = null; return; }
    // Use the entry from mousedown if still valid. Otherwise fresh check
    // using both geometric AND text-position detection. isConnected alone
    // isn't enough here — see isKjbEntryStillValid — a reused text node
    // stays connected even after virtualization overwrites its content.
    let entry = kjbLastHitEntry;
    if (!entry || !isKjbEntryStillValid(entry)) {
      entry = findKjbHit(e.clientX, e.clientY);
    }
    kjbLastHitEntry = null;
    if (!entry) return;
    e.preventDefault();
    e.stopPropagation();
    handleVerseClick(entry.ref, null);
    return;
  }

  const path = e.composedPath();
  const link = path.find(el =>
    el.tagName === "KJB-LINK" || (el.classList && el.classList.contains("kjb-link"))
  );
  if (!link) return;
  e.preventDefault();
  e.stopPropagation();
  const ref = link.dataset.ref;
  if (ref) {
    handleVerseClick(ref, link);
  }
}, true);

document.addEventListener("pointermove", (e) => {
  if (!supportsKjbTextHighlights) return;
  // Sticky hover: once hovering a reference, use a larger hit area to KEEP
  // the hover active. Only clear when the pointer moves clearly outside.
  const entry = findKjbHit(e.clientX, e.clientY);
  if (entry) {
    setKjbHoverEntry(entry);
  } else if (kjbHoveredEntry) {
    // Check if we're still within the hovered reference's expanded bounds
    // before clearing. This prevents cursor flicker at the edges. Grouped
    // by occId (this one physical occurrence), not ref text, so the
    // expanded bounds can't stretch to cover an unrelated repeat of the
    // same reference text elsewhere on the page.
    const pad = 15;
    try {
      const rects = kjbHighlightEntries
        .filter(en => en.occId === kjbHoveredEntry.occId && en.range.startContainer.isConnected)
        .flatMap(en => Array.from(en.range.getClientRects()));
      if (rects.length) {
        const left = Math.min(...rects.map(r => r.left)) - pad;
        const right = Math.max(...rects.map(r => r.right)) + pad;
        const top = Math.min(...rects.map(r => r.top)) - pad;
        const bottom = Math.max(...rects.map(r => r.bottom)) + pad;
        if (e.clientX >= left && e.clientX <= right &&
            e.clientY >= top && e.clientY <= bottom) {
          return; // still inside expanded bounds, keep hover
        }
      }
    } catch (_) {}
    setKjbHoverEntry(null);
  }
}, { passive: true, capture: true });
document.addEventListener("pointerleave", () => setKjbHoverEntry(null), true);

// --- Right-click on highlighted verse: tell background the verse ref ---
// This makes the "Search KJB Reader" page context menu act as "Look up verse"
// when right-clicking directly on a <kjb-link> element (no text selection needed).
document.addEventListener("contextmenu", (e) => {
  if (supportsKjbTextHighlights) {
    const entry = findKjbHit(e.clientX, e.clientY);
    kjbApi.runtime.sendMessage({ type: "KJB_RIGHTCLICK_VERSE", text: entry ? entry.ref : null }).catch(() => {});
    return;
  }

  const path = e.composedPath();
  const link = path.find(el =>
    el.tagName === "KJB-LINK" || (el.classList && el.classList.contains("kjb-link"))
  );
  kjbApi.runtime.sendMessage({ type: "KJB_RIGHTCLICK_VERSE", text: link && link.dataset.ref ? link.dataset.ref : null }).catch(() => {});
}, true);

// --- Listen for messages from background (context menu fallback) ---
chrome.runtime.onMessage.addListener((msg) => {
  console.log('[KJB Reader] Message received:', msg.type, msg.text || '');
  if (msg.type === "KJB_REMOVE_OVERLAY") {
    // The background picked a different surface (a popup window). Two surfaces
    // for one verse is the bug being fixed, so stand down immediately.
    if (overlayExists()) {
      console.log('[KJB Reader] removing overlay — background chose another surface');
      removeSidebarOverlay();
    }
    return;
  }

  if (msg.type === "KJB_PANEL_STATUS") {
    panelOpen = !!msg.open;
    console.log("[KJB Reader] Panel status update:", panelOpen);
    // Self-healing, but ONLY for an overlay we injected in the last 1.5s.
    // Beyond that window the overlay is there deliberately (panel was shut)
    // and a late broadcast must not close it under the user.
    if (panelOpen && Date.now() - lastOverlayInjectTs < 3000) {
      try { removeSidebarOverlay(); } catch (e) {}
    }
    return;
  }
  if (msg.type === "KJB_INJECT_OVERLAY") {
    // Only inject overlay in the top frame — prevents duplicate panels from iframes
    if (window !== window.top) return;
    if (!overlayAllowedHere(msg.reason || "unspecified")) return;
    // The background may ask for an overlay after chrome.sidePanel.open()
    // rejected — but that call rejects on some sites even while the panel is
    // visible. If the panel is beating, ignore the request.
    if (!msg.force && panelIsLive()) {
      console.log('[KJB Reader] KJB_INJECT_OVERLAY ignored — panel is live');
      return;
    }
    // If the overlay was just injected (within 2s), don't destroy and
    // recreate it — that causes a flash. Just update the storage so the
    // sidebar's storage listener picks up the new verse.
    if (overlayExists() && Date.now() - lastOverlayInjectTs < 2000) {
      console.log('[KJB Reader] KJB_INJECT_OVERLAY reusing fresh overlay');
      if (msg.text) {
        chrome.storage.local.set(
          { pendingLookup: msg.text, lookupTimestamp: Date.now() },
          () => { void chrome.runtime.lastError; }
        );
      }
      return;
    }
    // Inject overlay — with verse text (context menu/link click) or without (toolbar click)
    removeSidebarOverlay();
    const forceInject = !!msg.force;
    if (msg.text) {
      chrome.storage.local.set({ pendingLookup: msg.text, lookupTimestamp: Date.now() }, () => {
        injectSidebarOverlay(forceInject);
      });
    } else {
      injectSidebarOverlay(forceInject);
    }
  }
});

// ========================================================
// DOM GUARD
// A tab that has not been reloaded since the extension updated still runs the
// PREVIOUS content script. Once the extension reloads, that orphan's messaging
// context is dead — it cannot be told to stand down, yet it can still see
// clicks and still append an overlay to the DOM. That is the most likely
// source of the remaining brief overlay.
// MutationObserver callbacks run before the next paint, so an unauthorised
// overlay is removed in the same frame it appears: no visible flash.
// ========================================================
function startOverlayGuard() {
  try {
    const obs = new MutationObserver((records) => {
      for (const rec of records) {
        for (const node of rec.addedNodes) {
          if (!node || node.nodeType !== 1 || node.id !== "kjb-sidebar-overlay") continue;
          if (Date.now() < overlayAuthorizedUntil) continue;      // ours, on purpose
          if (overlayAllowedHere("dom-guard")) continue;          // legitimate surface here
          try { node.remove(); } catch (e) {}
          console.log('[KJB Reader] DOM guard removed an unauthorised overlay — ' +
                      'almost certainly a stale content script in this tab. Reload the tab to clear it.');
        }
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
}
startOverlayGuard();

// Notify background about PWA/standalone mode so context menu uses overlay instead of sidePanel
kjbApi.runtime.sendMessage({ type: "KJB_STANDALONE_MODE", isStandalone }).catch(() => {});

// --- Smart context menu ---
let selCheckTimer;
function checkSelection() {
  clearTimeout(selCheckTimer);
  selCheckTimer = setTimeout(() => {
    const sel = window.getSelection().toString().trim();
    if (!sel) return;
    VERSE_REGEX.lastIndex = 0;
    const isVerse = VERSE_REGEX.test(sel);
    kjbApi.runtime.sendMessage({ type: "KJB_SELECTION", isVerse: !!isVerse }).catch(() => {});
  }, 10);
}
document.addEventListener("mouseup", checkSelection);
document.addEventListener("keyup", (e) => { if (e.shiftKey || e.key === "Shift") checkSelection(); });


// --- Unified text scanning: read pages as one unified font ---
// When web pages use different fonts, spans, <b>, <i>, <a>, or other inline
// elements, verse references get split across multiple text nodes and the
// per-node scanner misses them. This function reads each block container's
// text as ONE unified string (combining all inline descendants), runs the
// verse regex, and uses Range API to wrap matches — regardless of how the
// text is split by fonts or styling.

// Block-level elements that define "paragraph" boundaries
const BLOCK_TAGS = new Set([
  "P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "TD", "TH",
  "SECTION", "ARTICLE", "BLOCKQUOTE", "PRE", "DT", "DD", "FIGCAPTION",
  "CAPTION", "MAIN", "ASIDE", "HEADER", "FOOTER", "FIGURE", "ADDRESS",
  "FIELDSET", "DETAILS", "SUMMARY", "DL", "OL", "UL", "TABLE"
]);

function isBlockElement(el) {
  return el && BLOCK_TAGS.has(el.tagName);
}

// Find the innermost block-level ancestor of a text node
function getBlockParent(node) {
  let parent = node.parentElement;
  while (parent && !isBlockElement(parent) && parent !== document.body) {
    parent = parent.parentElement;
  }
  return parent || document.body;
}

// --- Normalize character-spaced text ---
// Some web pages render text with spaces between every character, using
// \u00a0 (non-breaking space) for actual word boundaries.
// Example: "I \u00a0 C o r i n t h i a n s \u00a0 1 5 : 1 - 4"
// This normalizes it to: "I Corinthians 15:1-4" with position mapping
// so we can map matches back to the original DOM text nodes.
// Also handles Unicode spaces, full-width digits, and zero-width chars.
function normalizeSpacedText(text) {
  // Mark non-breaking spaces (word boundaries) with \x01
  // Also treat other Unicode spaces as word boundaries
  const marked = text
    .replace(/[\u00a0\u2000-\u200a\u202f\u205f\u3000]/g, "\x01")
    // Remove zero-width characters entirely (they don't take up space)
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
    // Convert full-width digits to ASCII
    .replace(/[\uff10-\uff19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30))
    // Convert full-width colon and hyphens to ASCII
    .replace(/\uff1a/g, ":")
    .replace(/[\u2010-\u2015\u2212\uff0d]/g, "-");

  let normalized = "";
  const normToOrig = [];

  for (let i = 0; i < marked.length; i++) {
    if (marked[i] === " " && i > 0 && i < marked.length - 1) {
      const prev = marked[i - 1];
      const next = marked[i + 1];
      if (/\w/.test(prev) && /\w/.test(next)) {
        const bothLetters = /[a-zA-Z]/.test(prev) && /[a-zA-Z]/.test(next);
        const bothDigits = /\d/.test(prev) && /\d/.test(next);
        if (bothLetters) {
          // Only remove if this is character spacing (X X X pattern), not a
          // word boundary between normal words (e.g., "in I" should stay "in I").
          // Check if the prev letter is also preceded by space+letter, or
          // the next letter is also followed by space+letter.
          const prevSpaced = i >= 3 && marked[i - 2] === " " && /\w/.test(marked[i - 3]);
          const nextSpaced = i + 3 < marked.length && marked[i + 2] === " " && /\w/.test(marked[i + 3]);
          if (prevSpaced || nextSpaced) continue;
        } else if (bothDigits) {
          continue;
        }
      }
      if (/\d/.test(prev) && /[:\-,;\u2013\u2014]/.test(next)) continue;
      if (/[:\-,;\u2013\u2014]/.test(prev) && /\d/.test(next)) continue;
    }
    normToOrig[normalized.length] = i;
    normalized += marked[i];
  }

  // Restore word boundaries: \x01 \u2192 space
  const final = normalized.replace(/\x01/g, " ");
  // Collapse double spaces
  const collapsed = final.replace(/  +/g, " ");
  if (collapsed !== final) {
    let ci = 0;
    const newMap = [];
    for (let fi = 0; fi < final.length; fi++) {
      if (final[fi] === " " && fi > 0 && final[fi - 1] === " ") continue;
      newMap[ci] = normToOrig[fi];
      ci++;
    }
    return { normalized: collapsed, normToOrig: newMap };
  }
  return { normalized: final, normToOrig };
}

// --- Read the entire page as plain text ---
// Instead of processing individual text nodes or blocks, this function reads
// ALL text on the page as one unified plain text string (like select-all +
// copy). It inserts a space between text nodes from different block parents
// to avoid merging words across paragraph boundaries. It then runs the verse
// regex on both the original text and the character-spacing-normalized text,
// and wraps matches using the Range API.
function processAsPlainText(root) {
  if (!root) return 0;
  let count = 0;

  // Walk ALL text nodes in the entire root (body, shadow root, etc.)
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || node.nodeValue.trim().length < 1) return NodeFilter.FILTER_REJECT;
      if (shouldSkipElement(node.parentElement)) return NodeFilter.FILTER_REJECT;
      // Skip text already inside kjb-link elements
      let p = node.parentElement;
      while (p) {
        if (p.tagName === "KJB-LINK" || (p.classList && p.classList.contains("kjb-link"))) return NodeFilter.FILTER_REJECT;
        p = p.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  // Build one combined text string with position tracking.
  // Insert a hard boundary marker when moving between different block
  // parents. This used to be a single space, but a plain space is
  // indistinguishable from a normal word-space to the regex — on
  // text-dense, many-small-blocks pages like Facebook comments/messages or
  // TikTok comments, the end of one unrelated block (e.g. a name ending in
  // a word) could combine with the start of a completely different block
  // (e.g. a timestamp or number) into a false "verse" match spanning two
  // unrelated elements. \x00 can never appear in real page text and never
  // matches \s or \w, so it hard-breaks any match attempting to cross a
  // block boundary while still collapsing to whitespace-like behavior
  // wherever normalizeSpacedText or trimming touches it.
  const BLOCK_BOUNDARY = "\x00";
  const textNodes = [];
  let combinedText = "";
  let prevBlock = null;
  let tn;
  while ((tn = walker.nextNode())) {
    const block = getBlockParent(tn);
    if (prevBlock !== null && block !== prevBlock && !combinedText.endsWith(BLOCK_BOUNDARY)) {
      combinedText += BLOCK_BOUNDARY;
    }
    textNodes.push({ node: tn, start: combinedText.length, end: combinedText.length + tn.nodeValue.length });
    combinedText += tn.nodeValue;
    prevBlock = block;
  }

  if (combinedText.length < 5) return 0;

  // --- Pass 1: match on original combined text ---
  VERSE_REGEX.lastIndex = 0;
  const matches = [];
  let m;
  while ((m = VERSE_REGEX.exec(combinedText)) !== null) {
    matches.push({ ref: normalizeRef(m), start: m.index, end: m.index + m[0].length });
  }

  // --- Pass 2: match on normalized text (character-spaced, Unicode, etc.) ---
  const { normalized, normToOrig } = normalizeSpacedText(combinedText);
  if (normalized !== combinedText) {
    VERSE_REGEX.lastIndex = 0;
    while ((m = VERSE_REGEX.exec(normalized)) !== null) {
      const origStart = normToOrig[m.index] ?? m.index;
      const origEnd = (normToOrig[m.index + m[0].length - 1] ?? (m.index + m[0].length - 1)) + 1;
      // Skip if this overlaps with an existing match
      const overlaps = matches.some(ex =>
        (origStart >= ex.start && origStart < ex.end) ||
        (origEnd > ex.start && origEnd <= ex.end) ||
        (origStart <= ex.start && origEnd >= ex.end)
      );
      if (!overlaps) {
        matches.push({ ref: normalizeRef(m), start: origStart, end: origEnd });
      }
    }
  }

  // --- Pass 3: fully compressed text (ALL spaces removed) ---
  // Last resort for pages where ALL text is character-spaced with no \u00a0.
  // Build a compressed version and try a modified regex that allows zero
  // spaces between book name and chapter.
  if (matches.length === 0) {
    let compressed = "";
    const compToOrig = [];
    for (let i = 0; i < combinedText.length; i++) {
      if (/\s/.test(combinedText[i]) && i > 0 && i < combinedText.length - 1) {
        // Only skip spaces between word chars or digit/punctuation
        const prev = combinedText[i - 1];
        const next = combinedText[i + 1];
        if (/\w/.test(prev) && /\w/.test(next)) continue;
        if (/\d/.test(prev) && /[:\-,;\u2013\u2014]/.test(next)) continue;
        if (/[:\-,;\u2013\u2014]/.test(prev) && /\d/.test(next)) continue;
      }
      compToOrig[compressed.length] = i;
      compressed += combinedText[i];
    }

    if (compressed !== combinedText) {
      VERSE_REGEX.lastIndex = 0;
      while ((m = VERSE_REGEX.exec(compressed)) !== null) {
        const origStart = compToOrig[m.index] ?? m.index;
        const origEnd = (compToOrig[m.index + m[0].length - 1] ?? (m.index + m[0].length - 1)) + 1;
        matches.push({ ref: normalizeRef(m), start: origStart, end: origEnd });
      }
    }
  }

  if (matches.length === 0) return 0;

  // Sort by start position
  matches.sort((a, b) => a.start - b.start);

  // Wrap matches in reverse order (earlier positions stay valid)
  for (let i = matches.length - 1; i >= 0; i--) {
    const { ref, start, end } = matches[i];

    let startNode = null, startOffset = 0;
    let endNode = null, endOffset = 0;

    for (const tn of textNodes) {
      if (!startNode && tn.end > start) {
        startNode = tn.node;
        startOffset = Math.max(0, start - tn.start);
      }
      if (tn.end >= end) {
        endNode = tn.node;
        endOffset = Math.min(endNode.nodeValue.length, end - tn.start);
        break;
      }
    }

    if (!startNode || !endNode) continue;

    try {
      // Wrap each contributing text segment under its existing parent rather
      // than moving a multi-element Range into one wrapper.
      if (wrapMappedTextSegments(textNodes, start, end, ref) > 0) count++;
    } catch (e) {}
  }

  return count;
}

// --- Unwrap existing kjb-link elements ---
// Before each scan, remove all existing kjb-link elements and replace them
// with their text content. This ensures that references which were partially
// wrapped in a previous scan (e.g., "Corinthians 15:1-4" without the "I" prefix)
// are fully visible as plain text so the scanner can detect the complete
// reference including any Roman numeral prefix.
function unwrapKjbLinks(root) {
  if (!root || !root.querySelectorAll) return;
  const links = root.querySelectorAll("kjb-link.kjb-link");
  if (links.length > 0) console.log("[KJB] Unwrapping", links.length, "existing kjb-links");
  for (const link of links) {
    const parent = link.parentNode;
    if (!parent) continue;
    // Move the original child nodes back out so rescans never flatten or
    // discard the host page's nested formatting.
    link.replaceWith(...link.childNodes);
    parent.normalize();
  }
}

// --- Scan ---

// --- Contrast-aware reference color safeguard ---
// Detected references inherit the host page's text color (per design).
// But on low-contrast pages the inherited color can be nearly invisible
// against the background. This function checks the page's effective text
// color against its background; if the WCAG contrast ratio is below 3:1,
// it overrides with a visible fallback so references are never invisible.
function kjbRelativeLuminance(r, g, b) {
  const s = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
}

function kjbContrastRatio(l1, l2) {
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function kjbParseColor(str) {
  if (!str) return null;
  const m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : null;
}

function kjbGetEffectiveBg(el) {
  let node = el;
  while (node && node !== document.documentElement) {
    const bg = getComputedStyle(node).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
      return kjbParseColor(bg);
    }
    node = node.parentElement;
  }
  // Check html element
  const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
  if (htmlBg && htmlBg !== 'rgba(0, 0, 0, 0)' && htmlBg !== 'transparent') {
    return kjbParseColor(htmlBg);
  }
  return [255, 255, 255]; // Default white
}

function kjbEnsureVisibleRefColor() {
  try {
    const textColor = kjbParseColor(getComputedStyle(document.body).color || 'rgb(0, 0, 0)');
    const bgColor = kjbGetEffectiveBg(document.body);
    if (!textColor || !bgColor) return;

    const textLum = kjbRelativeLuminance(textColor[0], textColor[1], textColor[2]);
    const bgLum = kjbRelativeLuminance(bgColor[0], bgColor[1], bgColor[2]);
    const ratio = kjbContrastRatio(textLum, bgLum);

    // 3:1 is the WCAG minimum for large text / UI components
    if (ratio < 3) {
      const safeColor = bgLum > 0.5 ? '#1a1a2e' : '#e5e7eb';
      document.documentElement.style.setProperty('--kjb-ref-color', safeColor);
      document.documentElement.style.setProperty('--kjb-ref-underline', safeColor);
    } else {
      // Contrast is fine — inherit the page's text color as before
      document.documentElement.style.removeProperty('--kjb-ref-color');
      document.documentElement.style.removeProperty('--kjb-ref-underline');
    }
  } catch (_) {}
}

function scan() {
  kjbEnsureVisibleRefColor();
  // Clean up wrappers from older extension versions before using non-DOM ranges.
  unwrapKjbLinks(document.body);

  if (supportsKjbTextHighlights) {
    clearKjbTextHighlights();
    processHyperlinkReferences(document.body);
    // Unified scanning catches both ordinary and multi-element references.
    processAsPlainText(document.body);
    getAllShadowRoots(document.body).forEach(sr => {
      unwrapKjbLinks(sr);
      processHyperlinkReferences(sr);
      processAsPlainText(sr);
    });
    renderKjbTextHighlights();
    return;
  }

  processHyperlinkReferences(document.body);
  processAsPlainText(document.body);
  processTextNodes(document.body);
  getAllShadowRoots(document.body).forEach(sr => { unwrapKjbLinks(sr); processHyperlinkReferences(sr); processAsPlainText(sr); processTextNodes(sr); });
  processIframes();
}

// Run on load (delayed to let Google Sites finish re-rendering)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => setTimeout(scan, 300));
} else {
  setTimeout(scan, 300);
}
// Re-send standalone mode after load (in case background missed the first message)
window.addEventListener("load", () => { setTimeout(() => kjbApi.runtime.sendMessage({ type: "KJB_STANDALONE_MODE", isStandalone }).catch(() => {}), 500); });

// Delayed re-scans for SPA content
window.addEventListener("load", () => { setTimeout(scan, 200); setTimeout(scan, 1000); setTimeout(scan, 3000); setTimeout(scan, 7000); });

// Periodic re-scan
let pc = 0;
const periodic = setInterval(() => {
  scan();
  if (++pc >= 10) { clearInterval(periodic); setInterval(scan, 10000); }
}, 2000);

// MutationObserver (debounced)
let scanTimer;
const observer = new MutationObserver(() => {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(() => {
    observer.disconnect();
    try { scan(); } catch(e) { console.warn("[KJB] scan error:", e); }
    finally { observe(); }
  }, 300);
});

function observe() {
  observer.observe(document.body, { childList: true, subtree: true });
  getAllShadowRoots(document.body).forEach(sr => { try { observer.observe(sr, { childList: true, subtree: true }); } catch(e) {} });
}
setTimeout(observe, 500);

}
