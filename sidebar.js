// KJB Reader - SidePanel - Main Sidebar Logic

(function() {
  // ============================================================
  // Is this sidebar.html running as the REAL side panel, or as the
  // in-page overlay iframe?  The overlay embeds this same file, so
  // without this check the overlay announces "the panel is open",
  // the background broadcasts that to every tab, and the content
  // script then removes the overlay — the overlay deleted itself,
  // which is the "flash" the user saw.
  const KJB_IS_OVERLAY = (function () {
    try {
      if (window !== window.top) return true;
      if (new URLSearchParams(location.search).get("ctx") === "overlay") return true;
    } catch (e) {}
    return false;
  })();
  // A fallback popup window runs this same page, but it must NOT claim to be
  // the side panel: if it acknowledged lookups, later verse clicks would be
  // routed to a window sitting behind the browser and the user would see
  // nothing happen at all.
  const KJB_IS_LOOKUP_WINDOW = /[?&]win=1/.test(location.search);
  const KJB_IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const KJB_IS_SIDE_PANEL = !KJB_IS_OVERLAY && !KJB_IS_LOOKUP_WINDOW;
  console.log("[KJB Sidebar] context:", KJB_IS_OVERLAY ? "OVERLAY (no presence)" : (KJB_IS_LOOKUP_WINDOW ? "LOOKUP WINDOW (no presence)" : "SIDE PANEL"));

  // ============================================================
  // CRITICAL PRESENCE + DELIVERY BLOCK  (v0.4.159)
  // Registered at the TOP of the file — OUTSIDE init()/bindEvents() —
  // so that any failure while wiring UI widgets can never prevent the
  // panel from (a) announcing that it is open, or (b) receiving verse
  // lookups.  Previously both lived inside bindEvents()/init(), which
  // are wrapped in try/catch: one null element silently killed them.
  // ============================================================
  // Firefox's chrome.* namespace is callback-based, so `chrome.runtime
  // .sendMessage(msg).catch(...)` throws a TypeError there (the message is sent,
  // but anything after it on the chain is skipped). The callback form is the one
  // shape that behaves identically on Chrome, Edge, Firefox and Opera.
  function kjbSend(message, onReply) {
    try {
      const result = chrome.runtime.sendMessage(message, (reply) => {
        void chrome.runtime.lastError;   // read it, or Chrome logs "unchecked"
        if (typeof onReply === "function") onReply(reply);
      });
      if (result && typeof result.then === "function") result.catch(() => {});
    } catch (e) {}
  }

  let earlyLookupTs = 0;
  // Set the moment a verse is actually handed to doSearch — receipt is not
  // delivery, and the difference is what broke the first click.
  let lookupDelivered = false;

  // Two independent paths can supply the first verse: the early message
  // listener (fast path) and checkPendingLookup()'s pull from the background
  // (slow path). Deciding this in one place, in a pure function, is why the
  // first click used to open the panel on the wrong content.
  function shouldPullPending(state) {
    // Nothing to pull if the fast path already got a verse for this open.
    return !(state.earlyLookupTs > 0 || state.lookupDelivered);
  }
  // Last line of defence: if a delivered lookup renders nothing (a dropped
  // proxy reply, a service worker restarting mid-request), retry once rather
  // than leaving the user looking at an empty panel.
  let watchdogUsed = false;
  function scheduleLookupWatchdog(text) {
    if (watchdogUsed || !text) return;
    watchdogUsed = true;
    setTimeout(() => {
      try {
        const list = document.getElementById("results-list");
        const rendered = list && list.children.length > 0;
        if (rendered) return;
        console.warn("[KJB Sidebar] lookup rendered nothing — retrying once:", text);
        const input = document.getElementById("search-input");
        if (input) input.value = text;
        doSearch(text);
      } catch (e) {}
    }, 1800);
  }

  function shouldRestoreLastChapter(state) {
    // Never replace a verse the user explicitly clicked with their last chapter.
    return !(state.earlyLookupTs > 0 || state.lookupDelivered);
  }

  function handleIncomingLookup(text, ts) {
    if (!text) return;
    const stamp = ts || Date.now();
    if (stamp <= earlyLookupTs) return;
    earlyLookupTs = stamp;
    try { lastHandledTimestamp = stamp; } catch (e) {}
    console.log("[KJB Sidebar] Lookup received:", text);
    // Tell the background we are alive so it can pull down any overlay
    // a content script may have already injected.  ONLY the real side
    // panel may do this — never the overlay iframe.
    if (KJB_IS_SIDE_PANEL) {
      kjbSend({ type: "KJB_PANEL_ALIVE" });
      // Beat immediately too. storage.onChanged fires straight into the content
      // script, so this is the fastest possible proof-of-life — and unlike the
      // interval below it cannot be throttled away.
      try { chrome.storage.local.set({ kjbPanelHeartbeat: Date.now(), kjbSidePanelOpen: true }); } catch (e) {}
    }
    const run = () => {
      try {
        const input = document.getElementById("search-input");
        if (input) input.value = text;
        lookupDelivered = true;
        doSearch(text);
        scheduleLookupWatchdog(text);
        // Drop the background's copy of THIS verse (matched by timestamp) so the
        // slow path cannot search it a second time.
        kjbSend({ type: "KJB_ACK_LOOKUP", ts: stamp });
        try { chrome.storage.local.remove("pendingLookup"); } catch (e) {}
      } catch (e) {
        console.warn("[KJB Sidebar] delivery failed:", e);
      }
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      run();
    }
  }

  // A verse handed over in the URL is delivered before any listener could have
  // missed it. This is the reliable path for the popup window and the overlay.
  (function deliverLookupFromUrl() {
    try {
      const params = new URLSearchParams(location.search);
      const q = params.get("q");
      if (!q) return;
      const ts = parseInt(params.get("ts"), 10) || Date.now();
      console.log("[KJB Sidebar] verse supplied in URL:", q);
      handleIncomingLookup(q, ts);
    } catch (e) {}
  })();

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "KJB_SIDEBAR_LOOKUP") handleIncomingLookup(msg.text, msg.ts);
  });

  let panelPort = null;
  function connectPanelPort() {
    try {
      panelPort = chrome.runtime.connect({ name: "kjbSidePanel" });
      console.log("[KJB Sidebar] Port connected");
      panelPort.onMessage.addListener((msg) => {
        if (msg && msg.type === "KJB_SIDEBAR_LOOKUP") handleIncomingLookup(msg.text, msg.ts);
      });
      panelPort.onDisconnect.addListener(() => {
        panelPort = null;
        setTimeout(connectPanelPort, 100);
      });
    } catch (e) {
      setTimeout(connectPanelPort, 500);
    }
  }
  if (KJB_IS_SIDE_PANEL) {
    connectPanelPort();
    // Heartbeat written straight into storage. A content script can read this
    // itself in a few milliseconds WITHOUT waking the service worker — which
    // is what caused the remaining flash: asking the sleeping SW took longer
    // than the click's patience, so the overlay was built, then removed.
    const beat = () => {
      try { chrome.storage.local.set({ kjbPanelHeartbeat: Date.now(), kjbSidePanelOpen: true }); } catch (e) {}
    };
    beat();
    setInterval(beat, 2000);
    // Chrome applies intensive timer throttling to documents it considers
    // hidden — and the side panel counts as hidden while the user is working
    // in the page. That can stretch the 2s interval to once per MINUTE, which
    // is why a stale heartbeat kept letting the overlay through. These events
    // are not throttled, so they keep the flag honest.
    document.addEventListener("visibilitychange", beat);
    window.addEventListener("focus", beat);
    document.addEventListener("click", beat, true);
    kjbSend({ type: "KJB_PANEL_ALIVE" });
    setInterval(() => {
      kjbSend({ type: "KJB_PANEL_ALIVE" });
    }, 2000);
    window.addEventListener("pagehide", () => {
      kjbSend({ type: "KJB_PANEL_CLOSED" });
      try { chrome.storage.local.remove("kjbPanelHeartbeat"); } catch (e) {}
      try { chrome.storage.local.set({ kjbSidePanelOpen: false }); } catch (e) {}
    });
  }

  // --- Safe DOM helpers (avoid innerHTML / document.write for AMO compliance) ---
  function setHTML(el, html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    el.replaceChildren(...doc.body.childNodes);
  }
  function writePrintDoc(win, html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    doc.head.querySelectorAll('style').forEach(s => win.document.head.appendChild(s.cloneNode(true)));
    win.document.body.replaceChildren(...doc.body.childNodes);
  }
  // --- Clipboard helper (with execCommand fallback for side panel focus issues) ---
  function copyToClipboard(text) {
    return new Promise((resolve, reject) => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(resolve, () => {
          // Clipboard API failed (e.g. panel lost focus) — fall back
          fallbackCopy(text, resolve, reject);
        }).catch(() => {
          fallbackCopy(text, resolve, reject);
        });
      } else {
        fallbackCopy(text, resolve, reject);
      }
    });
  }
  function fallbackCopy(text, resolve, reject) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) resolve();
      else reject(new Error("execCommand copy failed"));
    } catch (e) {
      reject(e);
    }
  }

  // --- Print helper ---
  // Three-tier fallback for maximum cross-platform reliability:
  //   1. window.open("_blank") — works on desktop side panels & overlays
  //   2. Off-screen full-size iframe with srcdoc — for mobile extension popups
  //      where window.open is blocked (Edge Android, Kiwi, etc.)
  //   3. chrome.tabs.create with a blob URL — last resort via background script
  function printHtmlDocument(html, title) {
    // Mobile first: skip the window.open / iframe tiers entirely. Firefox for
    // Android does not implement window.print(), and window.open there returns
    // a live-looking window object that never renders — so the old Tier 1
    // returned early and the button did nothing at all. Open a real tab and let
    // the browser's own Print / Save as PDF do the work.
    if (KJB_IS_MOBILE) {
      openPrintPage(html, title);
      return;
    }

    // Tier 1: Try window.open (desktop side panel, overlay in web page).
    // Android returns a window object that LOOKS usable but never renders, so a
    // truthy result is not proof of success: verify the document actually took
    // the content, and keep a watchdog in case printing silently no-ops.
    try {
      const w = window.open("", "_blank");
      if (w && w.document) {
        writePrintDoc(w, html);
        w.document.title = title || "Print";
        const alive = !w.closed && !!w.document.body && w.document.body.childNodes.length > 0;
        if (alive) {
          w.focus();
          let printed = false;
          const go = () => {
            try { w.print(); printed = true; } catch (e) { /* no print support */ }
          };
          w.onload = function () { setTimeout(go, 100); };
          setTimeout(go, 800);
          // If nothing could print and the window is gone or empty, fall back to
          // the print page rather than leaving the button looking broken.
          setTimeout(() => {
            if (!printed && (w.closed || !w.document || !w.document.body)) {
              openPrintPage(html, title);
            }
          }, 1800);
          return;
        }
        try { w.close(); } catch (e) {}
        console.warn("[KJB Reader] window.open returned a dead window — using the print page");
        openPrintPage(html, title);
        return;
      }
    } catch(e) { /* window.open blocked — fall through to iframe */ }

    // Tier 2: Off-screen full-size iframe with srcdoc
    // Mobile browsers refuse to print from zero-size iframes, so we use
    // actual dimensions positioned off-screen. srcdoc is more reliable
    // than manually writing to the iframe document.
    try {
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;top:0;left:-100vw;width:100vw;height:100vh;border:0;opacity:0;pointer-events:none;";
      iframe.setAttribute("aria-hidden", "true");
      iframe.setAttribute("srcdoc", html);
      document.body.appendChild(iframe);
      iframe.onload = function() {
        setTimeout(() => {
          try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
          } catch(e) {
            // Tier 3 fallback: send to background to open in a new tab
            printViaBackground(html, title);
          }
          setTimeout(() => { try { document.body.removeChild(iframe); } catch(e){} }, 3000);
        }, 200);
      };
      // Fallback: if onload doesn't fire in 1s, try printing directly
      setTimeout(() => {
        try {
          if (iframe.isConnected) {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
          }
        } catch(e) {
          printViaBackground(html, title);
          try { document.body.removeChild(iframe); } catch(e2){}
        }
      }, 1000);
    } catch(e) {
      // Tier 3: Use background script to open print content in a new tab
      printViaBackground(html, title);
    }
  }

  // --- Print via a real extension page (print.html) ---
  // Replaces the old blob: URL route. A blob document inherits the extension's
  // MV3 content-security-policy, so the inline auto-print <script> that route
  // appended was refused — the tab opened and then just sat there.
  function openPrintPage(html, title) {
    try {
      chrome.storage.local.set({
        kjbPrintPayload: { html: html, title: title || "KJB Reader", ts: Date.now() }
      }, function () {
        const url = chrome.runtime.getURL("print.html");
        try {
          chrome.tabs.create({ url: url });
        } catch (e) {
          // Popup contexts on some mobile builds disallow tabs.create; the
          // background has no such restriction.
          chrome.runtime.sendMessage({ type: "KJB_OPEN_PRINT_PAGE", url: url });
        }
      });
    } catch (e) {
      console.warn("[KJB Reader] print page could not be opened:", e);
    }
  }

  // Kept as the desktop last-resort name used by the iframe tier.
  function printViaBackground(html, title) {
    openPrintPage(html, title);
  }

  // --- DOM Elements ---
  const scrollTopBtn = document.getElementById("scroll-top-btn");
  const searchInput = document.getElementById("search-input");
  const btnAdvanced = document.getElementById("btn-advanced");
  const advancedPanel = document.getElementById("advanced-panel");
  const optWholeWord = document.getElementById("opt-whole-word");
  const optTestament = document.getElementById("opt-testament");
  const optBook = document.getElementById("opt-book");
  const optCaseSensitive = document.getElementById("opt-case-sensitive");
  const optWildcard = document.getElementById("opt-wildcard");
  const resultsList = document.getElementById("results-list");
  const loading = document.getElementById("loading");
  const resultCount = document.getElementById("result-count");
  const btnWebsite = document.getElementById("btn-website");
  const btnZoomOut = document.getElementById("btn-zoom-out");
  const btnZoomReset = document.getElementById("btn-zoom-reset");
  const btnZoomIn = document.getElementById("btn-zoom-in");
  const app = document.getElementById("app");
  const bookSuggestions = document.getElementById("book-suggestions");

  // Read mode elements
  const readContent = document.getElementById("read-content");
  const readBookSelect = document.getElementById("read-book-select");
  const btnDailyRead = document.getElementById("btn-daily-read");

  // --- State ---
  let currentResults = [];
  let currentQuery = "";
  let searchTimer = null;
  let lastHandledTimestamp = 0;  // Deduplicate lookups between checkPendingLookup and onChanged
  let currentUiScale = 1;
  const MIN_UI_SCALE = 0.75;
  const MAX_UI_SCALE = 1.5;
  const UI_SCALE_STEP = 0.1;

  // CSS `zoom` only became Baseline in May 2024 — Firefox has it from 126, so
  // Firefox ESR 115 and other older builds ignore it completely. Detect rather
  // than assume: with `zoom` ignored, the pixel width/height below would be
  // applied WITHOUT any scaling, leaving a layout that does not match the
  // viewport. That is worse than not scaling at all.
  const SUPPORTS_CSS_ZOOM = (() => {
    try {
      return typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("zoom", "1.5");
    } catch (e) { return false; }
  })();

  // Pure, so the geometry can be tested without a browser.
  // Same thresholds as the @container tiers in sidebar.css. Derived from the
  // header's ~202px of fixed furniture (see the comment there).
  const STACK_LAYOUT_PX = 380;   // title needs its own row to keep full size
  const TIGHT_LAYOUT_PX = 300;   // trim header padding a little
  // Below this much effective height the panel cannot show its header, search
  // strip, tabs, a usable read area and the footer at the same time, so it
  // switches to scrolling as a single document (see #app.kjb-short in the CSS).
  const SHORT_LAYOUT_PX = 560;

  // Fit text to a box by measurement rather than guesswork: shrink only as far
  // as genuinely needed, never below `min`, and never above the design size.
  function computeFittedFontSize(naturalWidth, availableWidth, baseSize, minSize) {
    if (!naturalWidth || !availableWidth || availableWidth <= 0) return baseSize;
    if (naturalWidth <= availableWidth) return baseSize;
    const scaled = Math.floor(baseSize * (availableWidth / naturalWidth));
    return Math.max(minSize, Math.min(baseSize, scaled));
  }
  // Sizing a scaled panel from innerHeight has the same flaw as CSS 100vh: on
  // Android innerHeight can include the strip behind a bottom address bar, so
  // the bottom of the column (and the footer) ends up under it. Expressing the
  // height as calc(100svh / scale) keeps the zoom arithmetic exact — the box is
  // 1/scale of the viewport, rendered back to full size by `zoom` — while
  // letting the engine resolve "how tall is the visible viewport" correctly.
  const SUPPORTS_SVH = (() => {
    try { return !!(window.CSS && CSS.supports && CSS.supports("height", "100svh")); }
    catch (_) { return false; }
  })();
  function scaledHeightCss(scale, viewportHeight) {
    if (SUPPORTS_SVH) return scale === 1 ? "100svh" : "calc(100svh / " + scale + ")";
    return viewportHeight / scale + "px";
  }

  function computeScaleStyles(scale, viewportWidth, viewportHeight, supportsZoom) {
    // The layout width the interface actually gets after scaling. Zooming in
    // buys bigger glyphs by spending horizontal room, so this is what decides
    // whether labels have to shrink.
    const effectiveWidth = viewportWidth / scale;
    // Zooming in spends vertical room too, so the height that decides the
    // layout is the scaled one — a 360px panel at 140% is a 257px layout.
    const effectiveHeight = viewportHeight / scale;
    const stack = effectiveWidth < STACK_LAYOUT_PX;
    const tight = effectiveWidth < TIGHT_LAYOUT_PX;
    const short = effectiveHeight < SHORT_LAYOUT_PX;
    if (scale === 1) return { reset: true, stack, tight, short, effectiveWidth, effectiveHeight };
    const width = viewportWidth / scale + "px";
    const height = viewportHeight / scale + "px";
    const heightCss = scaledHeightCss(scale, viewportHeight);
    if (supportsZoom) {
      // `zoom` scales the layout box too, so the element ends up occupying
      // exactly the viewport: (viewport / scale) * scale === viewport.
      return { zoom: String(scale), width, height, heightCss, clipHost: false, stack, tight, short, effectiveWidth, effectiveHeight };
    }
    // `transform: scale()` leaves the pre-transform box at its full size, so
    // scaling down leaves a box bigger than the viewport. Same rendered result,
    // but the host document must not grow scrollbars from it.
    return { transform: "scale(" + scale + ")", transformOrigin: "0 0", width, height, heightCss, clipHost: true, stack, tight, short, effectiveWidth, effectiveHeight };
  }

  // Measure the title against the room it actually has. This replaces the
  // guessed pixel table: the browser knows the real text width, including the
  // user's font and letter-spacing, which no estimate can.
  const HEADER_TITLE_BASE_PX = 14;
  const HEADER_TITLE_MIN_PX = 10;
  function fitHeaderTitle() {
    try {
      const h1 = document.querySelector(".header h1");
      if (!h1) return;
      h1.style.fontSize = HEADER_TITLE_BASE_PX + "px";
      // scrollWidth is the natural text width; clientWidth is the box it got.
      const natural = h1.scrollWidth;
      const available = h1.clientWidth;
      const size = computeFittedFontSize(natural, available, HEADER_TITLE_BASE_PX, HEADER_TITLE_MIN_PX);
      if (size !== HEADER_TITLE_BASE_PX) h1.style.fontSize = size + "px";
      // Only if even the minimum size overflows does the branding suffix go —
      // the brand name itself is never cut.
      const suffix = h1.querySelector(".header-suffix");
      if (suffix) {
        suffix.style.display = "";
        if (h1.scrollWidth > h1.clientWidth + 1) suffix.style.display = "none";
      }
    } catch (e) {}
  }

  function fitSearchPlaceholder() {
    try {
      const input = document.getElementById("search-input");
      if (!input) return;
      const full = input.getAttribute("data-placeholder-full") || input.placeholder;
      input.setAttribute("data-placeholder-full", full);
      const short = "Search verses or keywords";
      // A canvas measurement beats guessing which placeholder fits.
      const cs = window.getComputedStyle(input);
      const canvas = fitSearchPlaceholder._c || (fitSearchPlaceholder._c = document.createElement("canvas"));
      const ctx = canvas.getContext("2d");
      ctx.font = cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
      const room = input.clientWidth
        - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0) - 2;
      input.placeholder = (ctx.measureText(full).width <= room) ? full : short;
    } catch (e) {}
  }

  function refitHeader() {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => { fitHeaderTitle(); fitSearchPlaceholder(); });
    else { fitHeaderTitle(); fitSearchPlaceholder(); }
  }

  function applyUiScale(requestedScale, persist = false) {
    const numericScale = Number(requestedScale);
    const safeScale = Number.isFinite(numericScale) ? numericScale : 1;
    const scale = Math.round(Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, safeScale)) * 100) / 100;
    currentUiScale = scale;

    // Use CSS `zoom` on #app (not <html>) with pixel-based width/height.
    // Unlike `transform: scale()` — which only changes visual rendering
    // while leaving the pre-transform layout box intact (causing ancestor
    // overflow-x:hidden to clip content when zooming out, or leave gaps
    // when zooming in) — `zoom` changes BOTH the rendered size AND the
    // space the element occupies in its parent. So:
    //   width  = innerWidth  / scale  →  rendered = (innerWidth/scale) × scale = innerWidth
    //   height = innerHeight / scale  →  rendered = (innerHeight/scale) × scale = innerHeight
    // No clipping, no gaps, in either zoom direction.
    document.documentElement.style.removeProperty("zoom");
    document.documentElement.style.removeProperty("width");
    const styles = computeScaleStyles(scale, window.innerWidth, window.innerHeight, SUPPORTS_CSS_ZOOM);
    // JS now owns the scale via inline styles; drop prepaint's stylesheet so a
    // later reset to 100% cannot leave its zoom rule behind.
    try {
      const pre = document.getElementById("kjb-prepaint");
      if (pre) pre.remove();
    } catch (_) {}
    app.classList.toggle("kjb-stack", !!styles.stack);
    app.classList.toggle("kjb-tight", !!styles.tight);
    app.classList.toggle("kjb-short", !!styles.short);
    // prepaint.js's guess (html.kjb-short-pre) is a synchronous, one-shot read
    // of window.innerHeight taken before the panel/window has necessarily
    // settled into its final size — a freshly created popup window in
    // particular can report a transitional height on that very first tick.
    // If that guess said "short" but the real geometry (computed here, and
    // recomputed on every resize) is not, the CSS keyed off kjb-short-pre
    // (content-hugging #app + sticky footer) stayed active forever, since
    // nothing else ever cleared it — leaving a short results list with the
    // footer parked right under it and a dead gap of body background filling
    // the rest of the panel instead of the footer sitting at the true bottom.
    // Reconciling it here, every time this authoritative check runs, fixes
    // both directions: clears a wrong guess, and reinstates short mode if the
    // panel is later resized down to genuinely short.
    document.documentElement.classList.toggle("kjb-short-pre", !!styles.short);
    refitHeader();
    if (styles.reset) {
      app.style.removeProperty("zoom");
      app.style.removeProperty("width");
      app.style.removeProperty("height");
      app.style.removeProperty("min-height");
      app.style.removeProperty("transform");
      app.style.removeProperty("transform-origin");
      document.documentElement.style.removeProperty("overflow");
      if (document.body) document.body.style.removeProperty("overflow");
    } else {
      if (styles.zoom) {
        app.style.removeProperty("transform");
        app.style.removeProperty("transform-origin");
        app.style.zoom = styles.zoom;
      } else {
        app.style.removeProperty("zoom");
        app.style.transformOrigin = styles.transformOrigin;
        app.style.transform = styles.transform;
      }
      app.style.width = styles.width;
      if (styles.short) {
        // Height must follow the content, not the viewport, or the footer ends
        // up outside the box again. The scaled viewport height becomes a floor.
        app.style.height = "auto";
        app.style.minHeight = styles.heightCss || styles.height;
      } else {
        app.style.removeProperty("min-height");
        app.style.height = styles.heightCss || styles.height;
      }
      if (styles.clipHost && !styles.short) {
        document.documentElement.style.overflow = "hidden";
        if (document.body) document.body.style.overflow = "hidden";
      } else if (styles.clipHost && styles.short) {
        // transform:scale() leaves an oversized pre-transform box, so keep the
        // horizontal clip, but vertical scrolling has to stay available.
        document.documentElement.style.overflowX = "hidden";
        document.documentElement.style.overflowY = "auto";
        if (document.body) {
          document.body.style.overflowX = "hidden";
          document.body.style.overflowY = "auto";
        }
      } else {
        document.documentElement.style.removeProperty("overflow");
        if (document.body) document.body.style.removeProperty("overflow");
      }
    }

    const percent = Math.round(scale * 100);
    btnZoomReset.textContent = `${percent}%`;
    btnZoomReset.setAttribute("aria-label", `Reset interface size to 100 percent. Current size ${percent} percent.`);
    btnZoomOut.disabled = scale <= MIN_UI_SCALE;
    btnZoomIn.disabled = scale >= MAX_UI_SCALE;

    if (persist) {
      try {
        try { localStorage.setItem("kjbUiScale", String(scale)); } catch (_) {}
        const saved = chrome.storage.local.set({ sidebarUiScale: scale });
        if (saved && typeof saved.catch === "function") saved.catch(() => {});
      } catch (_) {}
    }
  }

  function loadUiScale() {
    // Take the synchronous mirror first — prepaint.js has already rendered at
    // this scale, so adopting it causes no visual change. Painting at 1 here
    // (as an earlier build did) is what produced the flash on every open.
    let initial = 1;
    try {
      const mirrored = parseFloat(localStorage.getItem("kjbUiScale"));
      if (mirrored && mirrored >= MIN_UI_SCALE && mirrored <= MAX_UI_SCALE) initial = mirrored;
    } catch (_) {}
    applyUiScale(initial);
    try {
      chrome.storage.local.get(["sidebarUiScale"], (data) => {
        // chrome.storage stays the source of truth; only re-apply if the
        // mirror was stale, so the common case never repaints.
        const saved = data && data.sidebarUiScale;
        if (saved && saved !== initial) applyUiScale(saved);
      });
    } catch (_) {}
  }

  // Re-run the scale math whenever the panel is resized (e.g. via the
  // resizable-width drag grip) so the pre-scale pixel box stays correct.
  let resizeRaf = null;
  // Runs at every scale: rotating a phone changes which layout mode applies
  // even when the interface is at 100%, and the old early return meant a
  // landscape rotation was never re-measured.
  const onViewportChange = () => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => applyUiScale(currentUiScale));
  };
  window.addEventListener("resize", onViewportChange);
  window.addEventListener("orientationchange", onViewportChange);

  // --- Restore last chapter (popup ↔ side panel state sync) ---
  function restoreLastChapter() {
    if (!shouldRestoreLastChapter({ earlyLookupTs, lookupDelivered })) {
      console.log("[KJB Sidebar] skipping last-chapter restore — a clicked verse owns this view");
      return;
    }
    try {
      chrome.storage.local.get(["sidebarLastBook", "sidebarLastChapter", "sidebarLastEndChapter"], (data) => {
        if (data && data.sidebarLastBook && data.sidebarLastChapter) {
          // Pre-load the last chapter into the Read tab, but do NOT activate
          // that tab. Opening the panel used to jump straight to Read, which
          // hid whatever the user actually opened the panel for.
          loadChapter(data.sidebarLastBook, data.sidebarLastChapter, null, null, data.sidebarLastEndChapter, false);
        }
      });
    } catch (e) {
      console.warn("[KJB] restoreLastChapter error:", e);
    }
  }

  // --- Init ---
  function init() {
    loadUiScale();
    refitHeader();
    try {
      if (typeof ResizeObserver === "function") {
        new ResizeObserver(() => refitHeader()).observe(document.querySelector(".header"));
      } else {
        window.addEventListener("resize", refitHeader);
      }
    } catch (e) { window.addEventListener("resize", refitHeader); }
    // Check for pending lookup FIRST — before anything else can fail
    try { checkPendingLookup(); } catch(e) { console.warn("[KJB] checkPendingLookup error:", e); }
    // Set up the rest (each wrapped so one failure doesn't block the others)
    try { bindEvents(); } catch(e) { console.warn("[KJB] bindEvents error:", e); }
    try { setupBookSuggestions(); } catch(e) { console.warn("[KJB] setupBookSuggestions error:", e); }
    try { setupReadBookSelect(); } catch(e) { console.warn("[KJB] setupReadBookSelect error:", e); }
    try { renderGospel(); } catch(e) { console.warn("[KJB] renderGospel error:", e); }
    try { renderResources(); } catch(e) { console.warn("[KJB] renderResources error:", e); }
    // Notify background that the side panel is open so verse-click lookups
    // push directly instead of calling sidePanel.open() (which can reject on
    // some sites and erroneously trigger the overlay fallback).
    if (KJB_IS_SIDE_PANEL) {
      kjbSend({ type: "KJB_PANEL_OPENED" });
      try { chrome.storage.local.set({ kjbSidePanelOpen: true }); } catch(e) {}
    }
  }

  // --- Pending Lookup (from verse link clicks and context menu) ---
  function checkPendingLookup() {
    if (!shouldPullPending({ earlyLookupTs, lookupDelivered })) {
      console.log("[KJB Sidebar] verse already delivered by the fast path — not pulling, not restoring");
      return;
    }
    // Pull model: ask background for the pending verse
    try {
      chrome.runtime.sendMessage({ type: "KJB_GET_PENDING" }, (resp) => {
        if (chrome.runtime.lastError) {
          // Background might not be ready — fall back to storage
          chrome.storage.local.get(["pendingLookup", "lookupTimestamp"], (data) => {
            if (data && data.pendingLookup && data.lookupTimestamp > lastHandledTimestamp) {
              lastHandledTimestamp = data.lookupTimestamp;
              lookupDelivered = true;
              searchInput.value = data.pendingLookup;
              doSearch(data.pendingLookup);
              chrome.storage.local.remove("pendingLookup");
            } else {
              // No pending lookup — restore last viewed chapter
              restoreLastChapter();
            }
          });
          return;
        }
        if (resp && resp.verse && resp.ts > lastHandledTimestamp) {
          lastHandledTimestamp = resp.ts;
          lookupDelivered = true;
          searchInput.value = resp.verse;
          doSearch(resp.verse);
          chrome.storage.local.remove("pendingLookup");
        } else {
          // No pending verse from background — check storage as fallback
          chrome.storage.local.get(["pendingLookup", "lookupTimestamp"], (data) => {
            if (data && data.pendingLookup && data.lookupTimestamp > lastHandledTimestamp) {
              lastHandledTimestamp = data.lookupTimestamp;
              lookupDelivered = true;
              searchInput.value = data.pendingLookup;
              doSearch(data.pendingLookup);
              chrome.storage.local.remove("pendingLookup");
            } else {
              // No pending lookup — restore last viewed chapter
              restoreLastChapter();
            }
          });
        }
      });
    } catch (e) {
      console.warn("[KJB] checkPendingLookup error:", e);
    }
  }


  // --- Book suggestions datalist ---
  function setupBookSuggestions() {
    const books = KJB_API.getBooks();
    setHTML(bookSuggestions, books.map(b => `<option value="${b.name}">`).join(""));
  }

  // --- Read mode book select ---
  function setupReadBookSelect() {
    const books = KJB_API.getBooks();
    const oldTest = books.filter(b => b.testament === "old");
    const newTest = books.filter(b => b.testament === "new");
    setHTML(readBookSelect, '<option value="">Select a book...</option>' +
      '<optgroup label="Old Testament">' +
      oldTest.map(b => `<option value="${b.name}">${b.name} (${b.chapters} ch.)</option>`).join("") +
      '</optgroup>' +
      '<optgroup label="New Testament">' +
      newTest.map(b => `<option value="${b.name}">${b.name} (${b.chapters} ch.)</option>`).join("") +
      '</optgroup>');
  }

  // --- Event Binding ---
  function bindEvents() {
    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimer);
      const query = searchInput.value.trim();
      if (!query) {
        showEmptyState(resultsList, "Search for a verse reference or keyword to get started.");
        resultCount.textContent = "";
        return;
      }
      searchTimer = setTimeout(() => doSearch(query), 350);
    });

    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        clearTimeout(searchTimer);
        doSearch(searchInput.value.trim());
      }
    });

    btnAdvanced.addEventListener("click", () => {
      advancedPanel.classList.toggle("hidden");
      const isOpen = !advancedPanel.classList.contains("hidden");
      btnAdvanced.textContent = isOpen ? "Advanced search ▾" : "Advanced search ▸";
    });

    [optWholeWord, optTestament, optBook, optCaseSensitive, optWildcard].forEach(el => {
      el.addEventListener("change", () => {
        if (searchInput.value.trim()) doSearch(searchInput.value.trim());
      });
    });

    // Tab switching — always route through switchToTab() so side-effects
    // (result-count visibility, scroll reset) are consistently applied.
    document.querySelectorAll(".tab").forEach(tab => {
      tab.addEventListener("click", () => {
        switchToTab(tab.dataset.tab);
      });
    });

    // Scroll-to-top button — appears when content-area is scrolled down.
    const contentArea = document.querySelector(".content-area");
    if (contentArea && scrollTopBtn) {
      const SCROLL_TOP_THRESHOLD = 200;
      // In short mode the document scrolls, not the read pane, so the button
      // has to watch and rewind whichever one is actually scrolling.
      const scroller = () => {
        if (contentArea.scrollHeight - contentArea.clientHeight > 2) return contentArea;
        const de = document.documentElement;
        if (de.scrollHeight - de.clientHeight > 2) return de;
        return contentArea;
      };
      const onScroll = () => {
        const el = scroller();
        if (el.scrollTop > SCROLL_TOP_THRESHOLD) {
          scrollTopBtn.classList.remove("hidden");
          scrollTopBtn.classList.add("visible");
        } else {
          scrollTopBtn.classList.remove("visible");
          setTimeout(() => {
            if (scroller().scrollTop <= SCROLL_TOP_THRESHOLD) {
              scrollTopBtn.classList.add("hidden");
            }
          }, 180);
        }
      };
      contentArea.addEventListener("scroll", onScroll);
      window.addEventListener("scroll", onScroll, { passive: true });
      scrollTopBtn.addEventListener("click", () => {
        scroller().scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    // Interface scale — affects text, controls, spacing, and icons together.
    btnZoomOut.addEventListener("click", () => applyUiScale(currentUiScale - UI_SCALE_STEP, true));
    btnZoomReset.addEventListener("click", () => applyUiScale(1, true));
    btnZoomIn.addEventListener("click", () => applyUiScale(currentUiScale + UI_SCALE_STEP, true));

    // Website link
    btnWebsite.addEventListener("click", () => {
      chrome.tabs.create({ url: KJB_API.getWebsiteUrl() });
    });

    // Legal links — open website extension pages in a browser tab (works on all browsers incl. Firefox)
    document.getElementById("link-privacy")?.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: "https://kingjamesbiblereader.com/extension-privacy" });
    });
    document.getElementById("link-terms")?.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: "https://kingjamesbiblereader.com/extension-terms" });
    });


    // Verse banner — open 2 Timothy 2 in Read tab
    btnDailyRead.addEventListener("click", () => {
      switchToTab("read");
      loadChapter("2 Timothy", 2, 15);
    });

    // Read mode book select
    readBookSelect.addEventListener("change", () => {
      const book = readBookSelect.value;
      if (book) loadChapter(book, 1);
    });

    // Message listener — backup channel when popup is already open
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === "KJB_LOOKUP") {
        searchInput.value = msg.text;
        doSearch(msg.text);
      }
    });

    // Push model: background sends verse directly (works when panel is already open).
    // IMPORTANT: call sendResponse so the background's runtime.sendMessage resolves
    // (signalling the panel is open) instead of rejecting (which would inject overlay).
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === "KJB_SIDEBAR_LOOKUP" && msg.text) {
        const ts = msg.ts || Date.now();
        if (ts > lastHandledTimestamp) {
          lastHandledTimestamp = ts;
          searchInput.value = msg.text;
          doSearch(msg.text);
          chrome.storage.local.remove("pendingLookup");
        }
        sendResponse({ received: true });
      }
    });

    // Storage fallback: triggers pull when storage changes (panel already open)
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.lookupTimestamp) {
        const newTs = changes.lookupTimestamp.newValue || 0;
        if (newTs > lastHandledTimestamp) {
          // Small delay so background has time to store pendingVerse
          setTimeout(() => {
            // RACE GUARD: the push path (KJB_SIDEBAR_LOOKUP via onMessage or
            // port) may have already delivered this verse. Don't overwrite it.
            if (lookupDelivered || earlyLookupTs > 0) return;
            chrome.runtime.sendMessage({ type: "KJB_GET_PENDING" }, (resp) => {
              if (lookupDelivered || earlyLookupTs > 0) return; // race guard
              if (resp && resp.verse && resp.ts > lastHandledTimestamp) {
                lastHandledTimestamp = resp.ts;
                searchInput.value = resp.verse;
                doSearch(resp.verse);
              } else {
                // Fall back to storage
                chrome.storage.local.get("pendingLookup", (data) => {
                  if (lookupDelivered || earlyLookupTs > 0) return; // race guard
                  if (data.pendingLookup) {
                    searchInput.value = data.pendingLookup;
                    doSearch(data.pendingLookup);
                    chrome.storage.local.remove("pendingLookup");
                  }
                });
              }
            });
          }, 100);
        }
      }
    });

    // Results multi-select buttons
    const resultsSelectBtn = document.getElementById("results-select");
    if (resultsSelectBtn) {
      resultsSelectBtn.addEventListener("click", () => toggleResultsSelectMode());
    }
    const resultsCopyAllBtn = document.getElementById("results-copy-all");
    if (resultsCopyAllBtn) {
      resultsCopyAllBtn.addEventListener("click", () => {
        const text = buildAllResultsCopyText();
        if (!text) return;
        copyToClipboard(text).then(() => {
          resultsCopyAllBtn.textContent = "✓";
          setTimeout(() => resultsCopyAllBtn.textContent = "📋 Copy All", 1500);
        }).catch((e) => {
          console.warn("[KJB] Copy all failed:", e);
          resultsCopyAllBtn.textContent = "✗";
          setTimeout(() => resultsCopyAllBtn.textContent = "📋 Copy All", 1500);
        });
      });
    }
    // Per-group "Copy All" buttons are inside .result-chapter-group sections
    // that get rebuilt on every render, so bind once via delegation on the
    // stable resultsList container instead of re-binding each button.
    if (!resultsList._groupCopyAllBound) {
      resultsList._groupCopyAllBound = true;
      resultsList.addEventListener("click", (e) => {
        const btn = e.target.closest(".result-group-copy-all");
        if (!btn) return;
        e.stopPropagation();
        const section = btn.closest(".result-chapter-group");
        if (!section) return;
        const text = buildResultsChapterCopyText(section);
        if (!text) return;
        copyToClipboard(text).then(() => {
          btn.textContent = "✓";
          setTimeout(() => btn.textContent = "📋 Copy All", 1500);
        }).catch((err) => {
          console.warn("[KJB] Copy chapter failed:", err);
          btn.textContent = "✗";
          setTimeout(() => btn.textContent = "📋 Copy All", 1500);
        });
      });
    }
    const resultsClearBtn = document.getElementById("results-clear-selected");
    if (resultsClearBtn) {
      resultsClearBtn.addEventListener("click", () => {
        selectedRefs.clear();
        resultsList.querySelectorAll(".result-card.selected").forEach(c => c.classList.remove("selected"));
        updateSelectCount();
      });
    }
    const resultsCopySelectedBtn = document.getElementById("results-copy-selected");
    if (resultsCopySelectedBtn) {
      resultsCopySelectedBtn.addEventListener("click", () => copySelectedVerses());
    }

  }


  function switchToTab(tabName) {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    document.querySelector(`[data-tab="${tabName}"]`)?.classList.add("active");
    const tabContent = document.getElementById(`tab-${tabName}`);
    tabContent?.classList.add("active");
    // Result count only visible on Results tab
    resultCount.style.display = tabName === "results" ? "" : "none";
    // Show read controls bar only on Read tab (only if a chapter is loaded)
    const readCtrls = document.getElementById("read-controls");
    if (readCtrls) readCtrls.style.display = (tabName === "read" && document.getElementById("read-content").querySelector(".read-verses")) ? "" : "none";
    // Scroll to top of content area (the actual scrollable container)
    const contentArea = document.querySelector(".content-area");
    if (contentArea) contentArea.scrollTop = 0;
    // Also scroll tab content if it's independently scrollable
    if (tabContent) tabContent.scrollTop = 0;
  }

  // --- Search Logic ---
  // Retries are per-search, not per-session: a genuine outage still surfaces.
  let transportRetries = 0;
  const MAX_TRANSPORT_RETRIES = 2;

  async function doSearch(query, options = {}) {
    if (!options._isRetry) transportRetries = 0;
    const { openVerseRangeInRead = false } = options;
    // allowBookOnly:false — a bare book name ("Joshua") must NOT be hijacked
    // into a chapter-1 reference; it runs a text search like the website does.
    // (Page-click detection and other parseRef callers are unaffected.)
    const ref = KJB_API.parseRef(query, { allowBookOnly: false });
    currentQuery = query;
    showLoading(true);

    try {
      let results = [];

      if (ref) {
        updateBookHint(null);
        results = await lookupRef(ref);

        // Build highlights only from verses the API actually returned. The
        // requested reference determines eligible chapters, but never supplies
        // unverified verse numbers to the highlight map.
        currentHighlightMap = {};
        const requestedVerseChapters = new Set();

        function registerVerseChapters(reference) {
          if (!reference) return;
          const ranges = reference.verseList || (reference.verse
            ? [{ verse: reference.verse, endVerse: reference.endVerse }]
            : []);
          for (const range of ranges) {
            if (range.verse !== null && range.verse !== undefined) {
              requestedVerseChapters.add(`${reference.book}:${reference.chapter}`);
            }
            if (range.crossChapter) {
              requestedVerseChapters.add(`${reference.book}:${range.crossChapter}`);
            }
          }
        }

        if (ref.multiRefs) ref.multiRefs.forEach(registerVerseChapters);
        else registerVerseChapters(ref);

        for (const result of results) {
          if (result.notFound || !result.book || !result.chapter || !result.verse) continue;
          const key = `${result.book}:${result.chapter}`;
          if (!requestedVerseChapters.has(key)) continue;
          if (!currentHighlightMap[key]) currentHighlightMap[key] = [];
          if (!currentHighlightMap[key].some(range => range[0] === result.verse && range[1] === result.verse)) {
            currentHighlightMap[key].push([result.verse, result.verse]);
          }
        }

        // Structural records and chapter headers are not successful content.
        // Never load Read mode for a missing chapter: doing so leaves stale
        // content visible and makes an out-of-range chapter appear as chapter 1.
        const hasMissingLookup = results.some(r => r.notFound);
        const hasConcreteLookup = results.some(r =>
          !r.notFound && !r.chapterHeader && !r.superscription && !r.colophon && !r.hebrewHeading
        );
        const lookupFailed = hasMissingLookup && !hasConcreteLookup;
        const requestedRanges = ref.verseList || [];
        const hasPrimaryVerseRange = requestedRanges.some(range =>
          range.verse && (
            (range.endVerse && range.endVerse > range.verse) ||
            range.crossChapter
          )
        );
        const shouldOpenVerseRangeInRead = openVerseRangeInRead &&
          hasPrimaryVerseRange && !ref.multiRefs;

        if (lookupFailed) {
          // Remove highlights from stale Read-mode content as well. A failed
          // lookup must never leave a previous verse looking like a match.
          readContent.querySelectorAll(".read-verse-highlight").forEach(el =>
            el.classList.remove("read-verse-highlight")
          );
        } else {
          const primaryRanges = currentHighlightMap[`${ref.book}:${ref.chapter}`] || [];
          const firstConfirmedVerse = primaryRanges[0]?.[0] || null;
          // Await Read rendering so a Gospel range click cannot race a second
          // navigation. The complete verified highlight map is consumed by
          // loadChapter, preserving every verse in a requested range.
          await loadChapter(ref.book, ref.chapter, firstConfirmedVerse, firstConfirmedVerse, ref.endChapter, false);
        }

        currentResults = results;
        // Don't highlight search terms for verse reference lookups — only for keyword searches
        renderResults(results, null);

        // Chapter ranges (e.g., "John 1-3") show in Results with all verses.
        // Single chapter-only lookups go to Read mode.
        // Verse-specific lookups and keyword searches show Results.
        if (lookupFailed) {
          switchToTab("results");
          resultsList.scrollTop = 0;
        } else if (ref.endChapter && !ref.verse) {
          switchToTab("results");
          resultsList.scrollTop = 0;
        } else if (!ref.verse || shouldOpenVerseRangeInRead) {
          switchToTab("read");
        } else {
          // Singular verse references always open Results first.
          switchToTab("results");
          resultsList.scrollTop = 0;
        }
      } else {
        results = await searchKeyword(query);
        // Insert chapter headers grouping results by book+chapter
        const grouped = [];
        let lastKey = '';
        for (const r of results) {
          if (r.notFound || !r.book) {
            grouped.push(r);
            continue;
          }
          const key = `${r.book}:${r.chapter}`;
          if (key !== lastKey) {
            grouped.push({
              chapterHeader: `${r.book} ${r.chapter}`,
              bookFullName: r.bookFullName || null,
            });
            lastKey = key;
          }
          grouped.push(r);
        }
        currentResults = grouped;
        renderResults(grouped, query);
        // When the keyword query is itself a book name ("Joshua", "Genesis"),
        // offer a one-click shortcut to open that book at chapter 1 — text
        // search may not be what the user wanted, and for books like Genesis
        // whose name never appears in verse text it is the only useful path.
        updateBookHint(query);

        // Build highlight map from keyword search results so that
        // navigating to any chapter in Read mode highlights the matching verses.
        currentHighlightMap = {};
        results.forEach(r => {
          if (r.book && r.chapter && r.verse) {
            const key = `${r.book}:${r.chapter}`;
            if (!currentHighlightMap[key]) {
              currentHighlightMap[key] = [[r.verse, r.verse]];
            } else {
              currentHighlightMap[key].push([r.verse, r.verse]);
            }
          }
        });

        switchToTab("results");
        resultsList.scrollTop = 0;
      }

      const contentArea = document.querySelector(".content-area");
      if (contentArea) contentArea.scrollTop = 0;
    } catch (err) {
      console.error("Search error:", err);
      // A cold service worker is the normal state on the FIRST lookup after the
      // browser starts, so a transport failure there is expected — retry it
      // rather than telling the user their verse does not exist.
      if (err && err.kjbTransport && transportRetries < MAX_TRANSPORT_RETRIES) {
        transportRetries++;
        const delay = 400 * transportRetries;
        console.warn("[KJB Sidebar] transport failed — retry " + transportRetries +
          " of " + MAX_TRANSPORT_RETRIES + " in " + delay + "ms");
        showEmptyState(resultsList, "Connecting…");
        switchToTab("results");
        setTimeout(() => { doSearch(query, { ...options, _isRetry: true }); }, delay);
        return;
      }
      showEmptyState(resultsList, err && err.kjbTransport
        ? "Couldn't reach the Bible service. Check your connection and try again."
        : `Search failed: ${err.message}`);
      resultCount.textContent = "";
      switchToTab("results");
    } finally {
      showLoading(false);
    }
  }

  // Helper: push verses from API data into results, with superscription/colophon
  // Colophon trust: the API (both the bundled PCE engine and the backend)
  // attaches data.colophon ONLY when the returned verses actually include the
  // chapter's true final verse — a bounded partial range (e.g. "Ephesians
  // 6:10-20") does NOT get the chapter's colophon, while a range that does
  // reach the end (e.g. "Ephesians 6:10-24") does. data.colophon is therefore
  // trusted unconditionally: it is never sent for a fetch that stops short of
  // the chapter's last verse. (Earlier heuristic versions guessed from the
  // requested endVerse, which wrongly suppressed legitimate colophons for
  // bounded ranges that reach the final verse.)
  function pushVersesWithMeta(arr, data, book, chapter) {
    const startIdx = arr.length;
    const bookFullName = data?.bookFullName || null;

    // Lookup paths create the chapter header before fetching. Attach the API's
    // exact KJV title to that header so Results and Read use the same wording.
    if (bookFullName) {
      const expectedHeader = `${book} ${chapter}`;
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i].chapterHeader === expectedHeader) {
          arr[i].bookFullName = bookFullName;
          break;
        }
      }
    }

    if (data && data.verses) {
      data.verses.forEach(v => {
        // Insert Psalm 119 Hebrew section heading before the first verse of each section
        if (book === "Psalms" && (v.chapter || chapter) === 119) {
          const hebrewEntry = PSALM_119_HEBREW.find(h => h.verse === v.verse);
          if (hebrewEntry) {
            arr.push({ hebrewHeading: hebrewEntry.name, hebrewLetter: hebrewEntry.letter, book, chapter: v.chapter || chapter });
          }
        }
        arr.push({
          ref: `${book} ${v.chapter || chapter}:${v.verse}`,
          text: v.text, book, bookFullName, chapter: v.chapter || chapter, verse: v.verse,
          readUrl: KJB_API.getReadUrl(book, v.chapter || chapter, v.verse),
        });
      });
      // Insert superscription before verses if present
      const sup = data.verses[0] && data.verses[0].superscription;
      if (sup) arr.splice(startIdx, 0, { superscription: sup, book, chapter });
    } else if (data && data.text) {
      // Insert Psalm 119 Hebrew section heading before single verse if applicable
      if (book === "Psalms" && chapter === 119) {
        const hebrewEntry = PSALM_119_HEBREW.find(h => h.verse === (data.verse || 1));
        if (hebrewEntry) {
          arr.push({ hebrewHeading: hebrewEntry.name, hebrewLetter: hebrewEntry.letter, book, chapter });
        }
      }
      arr.push({
        ref: `${book} ${chapter}:${data.verse || 1}`,
        text: data.text, book, bookFullName, chapter, verse: data.verse,
        readUrl: KJB_API.getReadUrl(book, chapter, data.verse || 1),
      });
      if (data.superscription) arr.splice(startIdx, 0, { superscription: data.superscription, book, chapter });
    }
    // Append colophon after verses — the API only includes it when the
    // fetched range reaches the chapter's actual final verse (see above).
    if (data && data.colophon) arr.push({ colophon: data.colophon, book, chapter });
    return data;
  }

  function pushMissingVerse(arr, book, chapter, verse, endVerse) {
    const refStr = verse
      ? `${book} ${chapter}:${verse}${endVerse ? `-${endVerse}` : ""}`
      : `${book} ${chapter}`;
    arr.push({
      ref: refStr,
      text: `Verse ${refStr} not found`,
      notFound: true,
      book,
      chapter,
      verse: verse || 0,
    });
  }

  function pushMissingChapter(arr, book, chapter) {
    const refStr = `${book} ${chapter}`;
    arr.push({
      ref: refStr,
      text: `Chapter ${refStr} not found`,
      notFound: true,
      missingType: "chapter",
      book,
      chapter,
      verse: 0,
    });
  }

  async function lookupRef(ref) {
    let allResults = [];

    // Handle multi-book references: e.g., "John 3:16, Romans 3:25"
    if (ref.multiRefs && ref.multiRefs.length > 1) {
      for (const subRef of ref.multiRefs) {
        // Add chapter header before each book's results
        if (subRef.endChapter && !subRef.verse) {
          // Chapter range within multi-book
          for (let ch = subRef.chapter; ch <= subRef.endChapter; ch++) {
            allResults.push({ chapterHeader: `${subRef.book} ${ch}` });
            const data = await KJB_API.getVerse(subRef.book, ch, 1, 200);
            if (data && (data.verses || data.text)) {
              pushVersesWithMeta(allResults, data, subRef.book, ch);
            } else {
              pushMissingChapter(allResults, subRef.book, ch);
            }
          }
        } else {
          const subRanges = subRef.verseList || [{ verse: subRef.verse, endVerse: subRef.endVerse }];
          // Add a chapter header before this book's verses
          allResults.push({ chapterHeader: `${subRef.book} ${subRef.chapter}` });
          for (const range of subRanges) {
            if (range.crossChapter) {
              // Cross-chapter within multi-book
              // (chapter header for starting chapter already added above)
              if (range.verse !== null && range.verse !== undefined) {
                const data1 = await KJB_API.getVerse(subRef.book, subRef.chapter, range.verse, 200);
                if (data1 && (data1.verses || data1.text)) {
                  pushVersesWithMeta(allResults, data1, subRef.book, subRef.chapter);
                } else {
                  pushMissingVerse(allResults, subRef.book, subRef.chapter, range.verse);
                }
              }
              allResults.push({ chapterHeader: `${subRef.book} ${range.crossChapter}` });
              const startV = range.crossChapterStartVerse || 1;
              const data2 = await KJB_API.getVerse(subRef.book, range.crossChapter, startV, range.crossChapterEndVerse);
              if (data2 && (data2.verses || data2.text)) {
                pushVersesWithMeta(allResults, data2, subRef.book, range.crossChapter);
              } else {
                pushMissingVerse(allResults, subRef.book, range.crossChapter, startV, range.crossChapterEndVerse);
              }
              continue;
            }
            const data = await KJB_API.getVerse(subRef.book, subRef.chapter, range.verse, range.endVerse);
            if (data && (data.verses || data.text)) {
              pushVersesWithMeta(allResults, data, subRef.book, subRef.chapter);
            } else {
              pushMissingVerse(allResults, subRef.book, subRef.chapter, range.verse, range.endVerse);
            }
          }
        }
      }
      return allResults;
    }

    // Handle chapter range: e.g., "John 1-3" — fetch all verses from all chapters in range
    if (ref.endChapter && !ref.verse) {
      for (let ch = ref.chapter; ch <= ref.endChapter; ch++) {
        // Add a chapter separator header before each chapter's verses
        allResults.push({ chapterHeader: `${ref.book} ${ch}` });
        const data = await KJB_API.getVerse(ref.book, ch, 1, 200);
        if (data && (data.verses || data.text)) {
          pushVersesWithMeta(allResults, data, ref.book, ch);
        } else {
          pushMissingChapter(allResults, ref.book, ch);
        }
      }
      return allResults;
    }

    // Support comma-separated verses: ref.verseList is an array of {verse, endVerse, crossChapter, crossChapterEndVerse}
    const ranges = ref.verseList || [{ verse: ref.verse, endVerse: ref.endVerse }];

    // Always add a chapter header before verses
    allResults.push({ chapterHeader: `${ref.book} ${ref.chapter}` });

    for (const range of ranges) {
      // Handle cross-chapter: either a range (e.g., John 3:16-4:10) or a standalone ref (e.g., "8:1-2")
      if (range.crossChapter) {
        // If verse is not null, this is a cross-chapter RANGE: get verses from starting verse to end of current chapter
        // (chapter header for starting chapter already added above)
        if (range.verse !== null && range.verse !== undefined) {
          const data1 = await KJB_API.getVerse(ref.book, ref.chapter, range.verse, 200);
          if (data1 && (data1.verses || data1.text)) {
            pushVersesWithMeta(allResults, data1, ref.book, ref.chapter);
          } else {
            pushMissingVerse(allResults, ref.book, ref.chapter, range.verse);
          }
        }
        // Chapter header for the cross chapter
        allResults.push({ chapterHeader: `${ref.book} ${range.crossChapter}` });
        // Get verses from crossChapterStartVerse (or 1) to crossChapterEndVerse in the cross chapter
        const startV = range.crossChapterStartVerse || 1;
        const data2 = await KJB_API.getVerse(ref.book, range.crossChapter, startV, range.crossChapterEndVerse);
        if (data2 && (data2.verses || data2.text)) {
          pushVersesWithMeta(allResults, data2, ref.book, range.crossChapter);
        } else {
          pushMissingVerse(allResults, ref.book, range.crossChapter, startV, range.crossChapterEndVerse);
        }
        continue; // Skip the normal single-chapter lookup below
      }

      const data = await KJB_API.getVerse(ref.book, ref.chapter, range.verse, range.endVerse);

      if (data && (data.verses || data.text)) {
        pushVersesWithMeta(allResults, data, ref.book, ref.chapter);
      } else {
        // Includes the API's structured 404 and the client-side safety net.
        if (range.verse) {
          pushMissingVerse(allResults, ref.book, ref.chapter, range.verse, range.endVerse);
        } else {
          pushMissingChapter(allResults, ref.book, ref.chapter);
        }
      }
    }

    return allResults;
  }

  async function searchKeyword(query) {
    const data = await KJB_API.search(query, {
      wholeWord: optWholeWord.checked,
      testament: optTestament.value,
      book: optBook.value.trim(),
      caseSensitive: optCaseSensitive.checked,
      wildcard: optWildcard.checked,
    });

    if (data && data.results) {
      return data.results.map(r => {
        // Structural records (Psalm superscription / epistle colophon hits)
        // arrive from the engine with their own text and no verse number —
        // pass them through untouched so renderResults can merge them into
        // verse cards instead of fabricating a broken ref for them.
        if (r.superscription || r.colophon || r.hebrewHeading) {
          return { ...r, total: data.total, readUrl: null };
        }
        return {
        ref: r.ref || `${r.book} ${r.chapter}:${r.verse}`,
        bookFullName: r.bookFullName ? r.bookFullName : null,
        text: r.text || r.content || "",
        book: r.book,
        chapter: r.chapter,
        verse: r.verse,
        total: data.total,
        readUrl: r.book ? KJB_API.getReadUrl(r.book, r.chapter, r.verse) : null,
        };
      });
    }

    if (data && data.error) {
      return [{ ref: "Error", text: data.error, book: "", chapter: 0, verse: 0 }];
    }

    return [];
  }

  // Track current book/chapter for control bar bindings
  let currentBook = '';
  let currentChapter = 0;
  let currentEndChapter = null;
  // Map of "book:chapter" -> [startVerse, endVerse] for cross-chapter highlight persistence
  let currentHighlightMap = {};

  // --- Read Mode: Load a chapter ---
  // --- KJV Structural Elements: Psalm 119 Hebrew letters ---
  const PSALM_119_HEBREW = [
    { verse: 1,   letter: "א", name: "ALEPH" },
    { verse: 9,   letter: "ב", name: "BETH" },
    { verse: 17,  letter: "ג", name: "GIMEL" },
    { verse: 25,  letter: "ד", name: "DALETH" },
    { verse: 33,  letter: "ה", name: "HE" },
    { verse: 41,  letter: "ו", name: "VAV" },
    { verse: 49,  letter: "ז", name: "ZAYIN" },
    { verse: 57,  letter: "ח", name: "HETH" },
    { verse: 65,  letter: "ט", name: "TETH" },
    { verse: 73,  letter: "י", name: "YOD" },
    { verse: 81,  letter: "כ", name: "KAPH" },
    { verse: 89,  letter: "ל", name: "LAMED" },
    { verse: 97,  letter: "מ", name: "MEM" },
    { verse: 105, letter: "נ", name: "NUN" },
    { verse: 113, letter: "ס", name: "SAMEKH" },
    { verse: 121, letter: "ע", name: "AYIN" },
    { verse: 129, letter: "פ", name: "PE" },
    { verse: 137, letter: "צ", name: "TSADHE" },
    { verse: 145, letter: "ק", name: "QOPH" },
    { verse: 153, letter: "ר", name: "RESH" },
    { verse: 161, letter: "ש", name: "SHIN" },
    { verse: 169, letter: "ת", name: "TAU" },
  ];

  // --- KJV Structural Elements: Epistle Subscriptions ---
  // These appear at the end of Pauline epistles in the KJV
  const EPISTLE_SUBSCRIPTIONS = {
    // Fallback only — the engine parses these verbatim from the PCE source
    // (data.__subscriptions) and supplies data.colophon. Values here are the
    // EXACT source lines, brackets included ([and] [sent], not the old
    // editorial "[and sent]"), and only the lines the source actually prints:
    // the PCE has no subscription after James, 1/2 Peter, 1/2/3 John, Jude or
    // Revelation, so those chapters correctly carry no subscription.
    "Romans|16":           "Written to the Romans from Corinthus, [and] [sent] by Phebe servant of the church at Cenchrea.",
    "1 Corinthians|16":    "The first [epistle] to the Corinthians was written from Philippi by Stephanas, and Fortunatus, and Achaicus, and Timotheus.",
    "2 Corinthians|13":    "The second [epistle] to the Corinthians was written from Philippi, [a] [city] of Macedonia, by Titus and Lucas.",
    "Galatians|6":         "Unto the Galatians written from Rome.",
    "Ephesians|6":         "Written from Rome unto the Ephesians by Tychicus.",
    "Philippians|4":       "It was written to the Philippians from Rome by Epaphroditus.",
    "Colossians|4":        "Written from Rome to the Colossians by Tychicus and Onesimus.",
    "1 Thessalonians|5":   "The first [epistle] unto the Thessalonians was written from Athens.",
    "2 Thessalonians|3":   "The second [epistle] to the Thessalonians was written from Athens.",
    "1 Timothy|6":         "The first to Timothy was written from Laodicea, which is the chiefest city of Phrygia Pacatiana.",
    "2 Timothy|4":         "The second [epistle] unto Timotheus, ordained the first bishop of the church of the Ephesians, was written from Rome, when Paul was brought before Nero the second time.",
    "Titus|3":             "It was written to Titus, ordained the first bishop of the church of the Cretians, from Nicopolis of Macedonia.",
    "Philemon|1":          "Written from Rome to Philemon, by Onesimus a servant.",
    "Hebrews|13":          "Written to the Hebrews from Italy by Timothy.",
  };


  // --- KJV Full Book Titles (as printed in the KJV) ---
  // Fallback titles only — the engine supplies bookFullName straight from the
  // source text. Generated from that source so both paths agree exactly.
  const BOOK_FULL_TITLES = {
    "Genesis":         "The First Book of Moses, called Genesis",
    "Exodus":          "The Second Book of Moses, called Exodus",
    "Leviticus":       "The Third Book of Moses, called Leviticus",
    "Numbers":         "The Fourth Book of Moses, called Numbers",
    "Deuteronomy":     "The Fifth Book of Moses, called Deuteronomy",
    "Joshua":          "The Book of Joshua",
    "Judges":          "The Book of Judges",
    "Ruth":            "The Book of Ruth",
    "1 Samuel":        "The First Book of Samuel, Otherwise called, the First Book of the Kings",
    "2 Samuel":        "The Second Book of Samuel, Otherwise called, the Second Book of the Kings",
    "1 Kings":         "The First Book of the Kings, Commonly called, the Third Book of the Kings",
    "2 Kings":         "The Second Book of the Kings, Commonly called, the Fourth Book of the Kings",
    "1 Chronicles":    "The First Book of the Chronicles",
    "2 Chronicles":    "The Second Book of the Chronicles",
    "Ezra":            "Ezra",
    "Nehemiah":        "The Book of Nehemiah",
    "Esther":          "The Book of Esther",
    "Job":             "The Book of Job",
    "Psalms":          "The Book of Psalms",
    "Proverbs":        "The Proverbs",
    "Ecclesiastes":    "Ecclesiastes; or, the Preacher",
    "Song of Solomon": "The Song of Solomon",
    "Isaiah":          "The Book of the Prophet Isaiah",
    "Jeremiah":        "The Book of the Prophet Jeremiah",
    "Lamentations":    "The Lamentations of Jeremiah",
    "Ezekiel":         "The Book of the Prophet Ezekiel",
    "Daniel":          "The Book of Daniel",
    "Hosea":           "Hosea",
    "Joel":            "Joel",
    "Amos":            "Amos",
    "Obadiah":         "Obadiah",
    "Jonah":           "Jonah",
    "Micah":           "Micah",
    "Nahum":           "Nahum",
    "Habakkuk":        "Habakkuk",
    "Zephaniah":       "Zephaniah",
    "Haggai":          "Haggai",
    "Zechariah":       "Zechariah",
    "Malachi":         "Malachi",
    "Matthew":         "The Gospel According to St. Matthew",
    "Mark":            "The Gospel According to St. Mark",
    "Luke":            "The Gospel According to St. Luke",
    "John":            "The Gospel According to St. John",
    "Acts":            "The Acts of the Apostles",
    "Romans":          "The Epistle of Paul the Apostle to the Romans",
    "1 Corinthians":   "The First Epistle of Paul the Apostle to the Corinthians",
    "2 Corinthians":   "The Second Epistle of Paul the Apostle to the Corinthians",
    "Galatians":       "The Epistle of Paul the Apostle to the Galatians",
    "Ephesians":       "The Epistle of Paul the Apostle to the Ephesians",
    "Philippians":     "The Epistle of Paul the Apostle to the Philippians",
    "Colossians":      "The Epistle of Paul the Apostle to the Colossians",
    "1 Thessalonians": "The First Epistle of Paul the Apostle to the Thessalonians",
    "2 Thessalonians": "The Second Epistle of Paul the Apostle to the Thessalonians",
    "1 Timothy":       "The First Epistle of Paul the Apostle to Timothy",
    "2 Timothy":       "The Second Epistle of Paul the Apostle to Timothy",
    "Titus":           "The Epistle of Paul to Titus",
    "Philemon":        "The Epistle of Paul to Philemon",
    "Hebrews":         "The Epistle of Paul the Apostle to the Hebrews",
    "James":           "The General Epistle of James",
    "1 Peter":         "The First Epistle General of Peter",
    "2 Peter":         "The Second Epistle General of Peter",
    "1 John":          "The First Epistle General of John",
    "2 John":          "The Second Epistle of John",
    "3 John":          "The Third Epistle of John",
    "Jude":            "The General Epistle of Jude",
    "Revelation":      "The Revelation of St. John the Divine",
  };

  function formatFullChapterHeader(header, apiBookFullName = null) {
    const match = String(header || "").match(/^(.+?)\s+(\d+)$/);
    if (!match) {
      return `<span class="result-chapter-book">${escapeHtml(String(header || ""))}</span>`;
    }
    const book = match[1];
    const chapter = match[2];
    const fullBookName = apiBookFullName || BOOK_FULL_TITLES[book] || book;
    return `<span class="result-chapter-book">${escapeHtml(fullBookName)}</span><span class="result-chapter-number">Chapter ${escapeHtml(chapter)}</span>`;
  }

  // --- KJV Structural Elements: Psalm Superscriptions (titles before verse 1) ---
  const PSALM_SUPERSCRIPTIONS = {
    3: "A Psalm of David, when he fled from Absalom his son.",
    4: "To the chief Musician on Neginoth, A Psalm of David.",
    5: "To the chief Musician upon Nehiloth, A Psalm of David.",
    6: "To the chief Musician on Neginoth upon Sheminith, A Psalm of David.",
    7: "Shiggaion of David, which he sang unto the LORD, concerning the words of Cush the Benjamite.",
    8: "To the chief Musician upon Gittith, A Psalm of David.",
    9: "To the chief Musician upon Muth-labben, A Psalm of David.",
    11: "To the chief Musician, [A] [Psalm] of David.",
    12: "To the chief Musician upon Sheminith, A Psalm of David.",
    13: "To the chief Musician, A Psalm of David.",
    14: "To the chief Musician, [A] [Psalm] of David.",
    15: "A Psalm of David.",
    16: "Michtam of David.",
    17: "A Prayer of David.",
    18: "To the chief Musician, [A] [Psalm] of David, the servant of the LORD, who spake unto the LORD the words of this song in the day [that] the LORD delivered him from the hand of all his enemies, and from the hand of Saul: And he said,",
    19: "To the chief Musician, A Psalm of David.",
    20: "To the chief Musician, A Psalm of David.",
    21: "To the chief Musician, A Psalm of David.",
    22: "To the chief Musician upon Aijeleth Shahar, A Psalm of David.",
    23: "A Psalm of David.",
    24: "A Psalm of David.",
    25: "[A] [Psalm] of David.",
    26: "[A] [Psalm] of David.",
    27: "[A] [Psalm] of David.",
    28: "[A] [Psalm] of David.",
    29: "A Psalm of David.",
    30: "A Psalm [and] Song [at] the dedication of the house of David.",
    31: "To the chief Musician, A Psalm of David.",
    32: "[A] [Psalm] of David, Maschil.",
    34: "[A] [Psalm] of David, when he changed his behaviour before Abimelech; who drove him away, and he departed.",
    35: "[A] [Psalm] of David.",
    36: "To the chief Musician, [A] [Psalm] of David the servant of the LORD.",
    37: "[A] [Psalm] of David.",
    38: "A Psalm of David, to bring to remembrance.",
    39: "To the chief Musician, [even] to Jeduthun, A Psalm of David.",
    40: "To the chief Musician, A Psalm of David.",
    41: "To the chief Musician, A Psalm of David.",
    42: "To the chief Musician, Maschil, for the sons of Korah.",
    44: "To the chief Musician for the sons of Korah, Maschil.",
    45: "To the chief Musician upon Shoshannim, for the sons of Korah, Maschil, A Song of loves.",
    46: "To the chief Musician for the sons of Korah, A Song upon Alamoth.",
    47: "To the chief Musician, A Psalm for the sons of Korah.",
    48: "A Song [and] Psalm for the sons of Korah.",
    49: "To the chief Musician, A Psalm for the sons of Korah.",
    50: "A Psalm of Asaph.",
    51: "To the chief Musician, A Psalm of David, when Nathan the prophet came unto him, after he had gone in to Bath-sheba.",
    52: "To the chief Musician, Maschil, [A] [Psalm] of David, when Doeg the Edomite came and told Saul, and said unto him, David is come to the house of Ahimelech.",
    53: "To the chief Musician upon Mahalath, Maschil, [A] [Psalm] of David.",
    54: "To the chief Musician on Neginoth, Maschil, [A] [Psalm] of David, when the Ziphims came and said to Saul, Doth not David hide himself with us?",
    55: "To the chief Musician on Neginoth, Maschil, [A] [Psalm] of David.",
    56: "To the chief Musician upon Jonath-elem-rechokim, Michtam of David, when the Philistines took him in Gath.",
    57: "To the chief Musician, Al-taschith, Michtam of David, when he fled from Saul in the cave.",
    58: "To the chief Musician, Al-taschith, Michtam of David.",
    59: "To the chief Musician, Al-taschith, Michtam of David; when Saul sent, and they watched the house to kill him.",
    60: "To the chief Musician upon Shushan-eduth, Michtam of David, to teach; when he strove with Aram-naharaim and with Aram-zobah, when Joab returned, and smote of Edom in the valley of salt twelve thousand.",
    61: "To the chief Musician upon Neginah, [A] [Psalm] of David.",
    62: "To the chief Musician, to Jeduthun, A Psalm of David.",
    63: "A Psalm of David, when he was in the wilderness of Judah.",
    64: "To the chief Musician, A Psalm of David.",
    65: "To the chief Musician, A Psalm [and] Song of David.",
    66: "To the chief Musician, A Song [or] Psalm.",
    67: "To the chief Musician on Neginoth, A Psalm [or] Song.",
    68: "To the chief Musician, A Psalm [or] Song of David.",
    69: "To the chief Musician upon Shoshannim, [A] [Psalm] of David.",
    70: "To the chief Musician, [A] [Psalm] of David, to bring to remembrance.",
    72: "[A] [Psalm] for Solomon.",
    73: "A Psalm of Asaph.",
    74: "Maschil of Asaph.",
    75: "To the chief Musician, Al-taschith, A Psalm [or] Song of Asaph.",
    76: "To the chief Musician on Neginoth, A Psalm [or] Song of Asaph.",
    77: "To the chief Musician, to Jeduthun, A Psalm of Asaph.",
    78: "Maschil of Asaph.",
    79: "A Psalm of Asaph.",
    80: "To the chief Musician upon Shoshannim-Eduth, A Psalm of Asaph.",
    81: "To the chief Musician upon Gittith, [A] [Psalm] of Asaph.",
    82: "A Psalm of Asaph.",
    83: "A Song [or] Psalm of Asaph.",
    84: "To the chief Musician upon Gittith, A Psalm for the sons of Korah.",
    85: "To the chief Musician, A Psalm for the sons of Korah.",
    86: "A Prayer of David.",
    87: "A Psalm [or] Song for the sons of Korah.",
    88: "A Song [or] Psalm for the sons of Korah, to the chief Musician upon Mahalath Leannoth, Maschil of Heman the Ezrahite.",
    89: "Maschil of Ethan the Ezrahite.",
    90: "A Prayer of Moses the man of God.",
    92: "A Psalm [or] Song for the sabbath day.",
    98: "A Psalm.",
    100: "A Psalm of praise.",
    101: "A Psalm of David.",
    102: "A Prayer of the afflicted, when he is overwhelmed, and poureth out his complaint before the LORD.",
    103: "[A] [Psalm] of David.",
    108: "A Song [or] Psalm of David.",
    109: "To the chief Musician, A Psalm of David.",
    110: "A Psalm of David.",
    120: "A Song of degrees.",
    121: "A Song of degrees.",
    122: "A Song of degrees of David.",
    123: "A Song of degrees.",
    124: "A Song of degrees of David.",
    125: "A Song of degrees.",
    126: "A Song of degrees.",
    127: "A Song of degrees for Solomon.",
    128: "A Song of degrees.",
    129: "A Song of degrees.",
    130: "A Song of degrees.",
    131: "A Song of degrees of David.",
    132: "A Song of degrees.",
    133: "A Song of degrees of David.",
    134: "A Song of degrees.",
    138: "[A] [Psalm] of David.",
    139: "To the chief Musician, A Psalm of David.",
    140: "To the chief Musician, A Psalm of David.",
    141: "A Psalm of David.",
    142: "Maschil of David; A Prayer when he was in the cave.",
    143: "A Psalm of David.",
    144: "[A] [Psalm] of David.",
    145: "David's [Psalm] of praise.",
  };

  // Render [bracketed] text as italic; rest stays normal
  function italicizeBrackets(text) {
    return escapeHtml(text).replace(/\[([^\]]*)\]/g, '<i>$1</i>');
  }
  function italicizeBracketsForPrint(text) {
    return text.replace(/\[([^\]]*)\]/g, '<i>$1</i>');
  }
  // Consecutive translators'-addition words are sometimes bracketed
  // individually in the source text ("[Lord] [thy] [God]") rather than as
  // one span. Rendered as HTML that's invisible — adjacent <i> tags with a
  // space between them look like one continuous italicized phrase either
  // way — but in copied plain text the brackets themselves stay visible,
  // so it reads as several separate italic notes instead of one. Merging
  // any bracket pairs that are directly adjacent (only whitespace between
  // them) into a single span fixes that for every copy path.
  function mergeAdjacentItalics(text) {
    return text.replace(/\]\s*\[/g, ' ');
  }

  // Shared by "Copy" (whole chapter) and "Copy Selected" (tick mode) in the
  // Read tab, so both stay in sync with what structural elements are captured.
  function centerLine(str, lead = 0) {
    const width = 80;
    const len = str.length;
    if (len >= width) return str;
    // `lead` accounts for characters already printed on the line before this
    // one (e.g. the opening quotation mark when a Hebrew name or Psalm title
    // is centred INSIDE the quoted passage), so the text stays visually centred.
    const pad = Math.max(0, Math.floor((width - len) / 2) - lead);
    return '\u00A0'.repeat(pad) + str;
  }
  // Reconstructs KJV plain-text convention from rendered structural markup:
  // <i>/<em> text (translators' additions, shown italic on screen) becomes
  // [bracketed] text in plain-text copy; everything else — including the
  // pilcrow — copies as-is. Never wrap the WHOLE line in brackets; only the
  // parts that were actually italic.
  function bracketedTextFromElement(el) {
    let out = "";
    el.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        out += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === "I" || node.tagName === "EM") {
          out += "[" + node.textContent + "]";
        } else {
          out += node.textContent;
        }
      }
    });
    return mergeAdjacentItalics(out.replace(/\s+/g, ' ').trim());
  }

  // Cleans a raw verse's source text for copying to the clipboard.
  // KJB_API.toPlainText() strips [brackets] entirely — correct for its own
  // internal use (word-boundary search matching), but wrong here: it made
  // single-verse copy and "Copy Selected" silently drop the italics markup
  // that "Copy Chapter" (which uses the raw dataset.text directly) kept,
  // so the two copy paths produced inconsistent output for the same verse.
  // This only normalizes whitespace and merges adjacent italics — brackets
  // stay intact, matching "Copy Chapter"'s behavior.
  function cleanVerseTextForCopy(text) {
    return mergeAdjacentItalics(String(text || '').replace(/\s+/g, ' ').trim());
  }

  // Builds the Read tab's "Copy Chapter" text: title, chapter number, then
  // every structural element (Psalm superscriptions, Hebrew section names,
  // verses, epistle subscriptions) in DOM order. Shared with "Copy Selected"
  // in the Read tab so both stay in sync with what gets captured.
  function buildReadCopyText(elements, fullTitle, chapter) {
    let text = centerLine(fullTitle) + "\n" + centerLine(`Chapter ${chapter}`) + "\n\n";
    elements.forEach(el => {
      if (el.classList.contains("psalm-superscription")) {
        text += centerLine(bracketedTextFromElement(el)) + "\n\n";
      } else if (el.classList.contains("psalm-section-heading")) {
        text += "\n" + centerLine(bracketedTextFromElement(el)) + "\n\n";
      } else if (el.classList.contains("read-verse")) {
        const vn = el.querySelector(".read-verse-num");
        const raw = el.dataset.verseText || el.querySelector(".read-verse-text").textContent;
        const plain = cleanVerseTextForCopy(raw);
        const verseNum = vn ? vn.textContent : "";
        text += verseNum ? `${verseNum} ${plain}\n` : `${plain}\n`;
      } else if (el.classList.contains("epistle-subscription")) {
        text += "\n" + centerLine(bracketedTextFromElement(el)) + "\n";
      }
    });
    return text.replace(/[\s]+$/, '');
  }

  async function loadChapter(book, chapter, highlightVerse, highlightEndVerse, endChapter, manageLoading = true) {
    if (manageLoading) showLoading(true);
    currentBook = book;
    currentChapter = chapter;
    currentEndChapter = endChapter || null;

    // Persist current chapter so popup ↔ side panel transitions carry state
    try {
      chrome.storage.local.set({
        sidebarLastBook: book,
        sidebarLastChapter: chapter,
        sidebarLastEndChapter: endChapter || null,
        sidebarLastTs: Date.now()
      });
    } catch (_) {}

    // Build highlight ranges from the highlight map (always, even when explicit highlight is passed)
    let highlightRanges = [];
    if (currentHighlightMap) {
      const mapKey = `${book}:${chapter}`;
      const mapped = currentHighlightMap[mapKey];
      if (mapped) {
        highlightRanges = mapped.map(r => Array.isArray(r) ? r : [r[0], r[1]]);
      }
    }
    // Also add the explicit highlight range
    if (highlightVerse) {
      const explRange = [highlightVerse, highlightEndVerse || highlightVerse];
      if (!highlightRanges.some(r => r[0] === explRange[0] && r[1] === explRange[1])) {
        highlightRanges.push(explRange);
      }
    }
    try {
      // Use verse range (1-200) to get a verses array from the API
      // The API returns individual verse objects for ranges but not for full chapter requests
      const data = await KJB_API.getVerse(book, chapter, 1, 200);
      if (!data || !data.text) return;

      const chapterText = data.text;
      const bookInfo = KJB_API.findBook(book);
      const totalChapters = bookInfo ? bookInfo.chapters : 0;

      // Populate the DETACHED read-controls bar (outside scroll area)
      const fullTitle = (data.bookFullName || BOOK_FULL_TITLES[book] || book);

      // Book title bar — show range if applicable (e.g., "John 1-3")
      const titleBar = document.getElementById('read-book-title-bar');
      if (titleBar) {
        if (endChapter && endChapter > chapter) {
          titleBar.textContent = `${fullTitle} — Chapters ${chapter}-${endChapter}`;
        } else {
          titleBar.textContent = `${fullTitle} — Chapter ${chapter}`;
        }
      }

      // Book dropdown
      const bookDropdown = document.getElementById('read-book-dropdown');
      if (bookDropdown) {
        setHTML(bookDropdown, '<optgroup label="Old Testament">' +
          KJB_API.getBooks().filter(b => b.testament === "old").map(b => `<option value="${b.name}" ${b.name === book ? 'selected' : ''}>${b.name}</option>`).join("") +
          '</optgroup><optgroup label="New Testament">' +
          KJB_API.getBooks().filter(b => b.testament === "new").map(b => `<option value="${b.name}" ${b.name === book ? 'selected' : ''}>${b.name}</option>`).join("") +
          '</optgroup>');
      }

      // Chapter dropdown
      const chapterDropdown = document.getElementById('read-chapter-dropdown');
      if (chapterDropdown) {
        const maxCh = endChapter ? Math.min(endChapter, totalChapters) : totalChapters;
        setHTML(chapterDropdown, Array.from({length: maxCh}, (_, i) => `<option value="${i+1}" ${i+1 === chapter ? 'selected' : ''}>${i+1}</option>`).join(""));
      }

      // Prev/Next disabled state
      const prevBtn = document.getElementById('read-prev');
      const nextBtn = document.getElementById('read-next');
      if (prevBtn) prevBtn.disabled = chapter <= (endChapter ? Math.min(endChapter, 1) : 1);
      if (nextBtn) nextBtn.disabled = endChapter ? chapter >= endChapter : chapter >= totalChapters;

      // NOTE: Don't show read-controls here — switchToTab handles that.
      // Only verses go in the scroll area
      let html = `<div class="read-verses" id="read-verses">
      `;

      // The API returns individual verse objects for verse ranges
      let verses = [];
      // Let's try to get individual verses using the API if verses array is available
      if (data.verses && data.verses.length > 0) {
        verses = data.verses;
      } else if (data.text) {
        // Fallback: show full chapter text as one block
        verses = [{ verse: null, text: data.text, chapter: chapter }];
      } else {
        return;
      }

      // Insert Psalm superscription (title) before verse 1
      if (book === "Psalms") {
        const psalmSuperscription = (data.verses && data.verses[0] && data.verses[0].superscription) || PSALM_SUPERSCRIPTIONS[chapter];
        if (psalmSuperscription) {
          html += `<div class="psalm-superscription">¶ ${italicizeBrackets(psalmSuperscription)}</div>`;
        }
      }

      if (verses.length > 0 && verses[0].verse !== null) {
        verses.forEach(v => {
          // Insert section heading for Psalm 119 (name only, centered)
          if (book === "Psalms" && chapter === 119) {
            const hebrewEntry = PSALM_119_HEBREW.find(h => h.verse === v.verse);
            if (hebrewEntry) {
              html += `<div class="psalm-section-heading">${hebrewEntry.name}</div>`;
            }
          }
          const isHighlight = highlightRanges.some(r => v.verse >= r[0] && v.verse <= r[1]);
          html += `
            <div class="read-verse ${isHighlight ? 'read-verse-highlight' : ''}" id="verse-${v.verse}" data-verse-text="${escapeHtml(v.text)}">
              <sup class="read-verse-num">${v.verse}</sup>
              <span class="read-verse-text">${formatVerseText(v.text)}</span>
            </div>
          `;
        });
      } else {
        html += `<div class="read-verse"><span class="read-verse-text">${formatVerseText(data.text || chapterText || '')}</span></div>`;
      }

      html += `</div>`;

      // Add epistle subscription / colophon
      // Prefer the API's colophon field (has proper [bracket] italics), fall back to hardcoded data
      const subKey = `${book}|${chapter}`;
      const colophonText = data.colophon || EPISTLE_SUBSCRIPTIONS[subKey];
      if (colophonText) {
        const cleanColophon = String(colophonText).replace(/^\s*¶\s*/, "");
        html += `<div class="epistle-subscription"><span class="structural-pilcrow">¶</span> ${italicizeBrackets(cleanColophon)}</div>`;
      }


      setHTML(readContent, html);
      // Scroll to top of chapter — only if currently on Read tab
      readContent.scrollTop = 0;
      const activeTab = document.querySelector(".tab.active");
      const isOnReadTab = activeTab && activeTab.dataset.tab === "read";
      if (isOnReadTab) {
        const contentArea = document.querySelector(".content-area");
        if (contentArea) contentArea.scrollTop = 0;
      }

      // Update read-controls bar visibility now that verses are loaded.
      // This handles the race condition where switchToTab("read") ran before
      // the API call finished (e.g. chapter-only lookups like "Psalm 119").
      const readCtrls = document.getElementById('read-controls');
      if (readCtrls && readContent.querySelector('.read-verses')) {
        // Only show if user is currently on the Read tab
        readCtrls.style.display = isOnReadTab ? '' : 'none';
      } else if (readCtrls) {
        readCtrls.style.display = 'none';
      }

      // Bind nav events using event delegation (controls are static in DOM)
      const rcEl = document.getElementById('read-controls');
      if (rcEl && !rcEl._bound) {
        rcEl._bound = true;
        rcEl.addEventListener("click", (e) => {
          const prev = e.target.closest("#read-prev");
          const next = e.target.closest("#read-next");
          const openWeb = e.target.closest("#read-open-web");
          if (prev && !prev.disabled) loadChapter(currentBook, currentChapter - 1, null, null, currentEndChapter);
          if (next && !next.disabled) loadChapter(currentBook, currentChapter + 1, null, null, currentEndChapter);
          if (openWeb) chrome.tabs.create({ url: KJB_API.getReadUrl(currentBook, currentChapter) });
        });
        const bd = rcEl.querySelector("#read-book-dropdown");
        if (bd) bd.addEventListener("change", () => loadChapter(bd.value, 1));
        const cd = rcEl.querySelector("#read-chapter-dropdown");
        if (cd) cd.addEventListener("change", () => loadChapter(currentBook, parseInt(cd.value, 10), null, null, currentEndChapter));
      }

      // Select = toggle tick mode (clone to avoid duplicate listeners)
      const versesEl = document.getElementById("read-verses");
      // Copy chapter (clone to avoid duplicate listeners)
      const readCopyOld = document.getElementById("read-copy");
      if (readCopyOld) {
        const readCopy = readCopyOld.cloneNode(true);
        readCopyOld.parentNode.replaceChild(readCopy, readCopyOld);
        readCopy.addEventListener("click", () => {
          const versesEl = document.getElementById("read-verses");
          if (!versesEl) return;
          const fullTitle = (data.bookFullName || BOOK_FULL_TITLES[book] || book);
          // Walk through all elements in DOM order to capture superscriptions,
          // Hebrew headings, verses (with pilcrows), and epistle subscriptions
          const allEls = readContent.querySelectorAll(
            ".psalm-superscription, .psalm-section-heading, .read-verse, .epistle-subscription"
          );
          const text = buildReadCopyText(allEls, fullTitle, chapter);

          copyToClipboard(text).then(() => {
            readCopy.textContent = "✓";
            setTimeout(() => readCopy.textContent = "📋 Copy", 1500);
          }).catch((e) => {
            console.warn("[KJB] Copy failed:", e);
            readCopy.textContent = "✗";
            setTimeout(() => readCopy.textContent = "📋 Copy", 1500);
          });
        });
      }

      // Print chapter (clone to avoid duplicate listeners)
      const readPrintOld = document.getElementById("read-print");
      if (readPrintOld) {
        const readPrint = readPrintOld.cloneNode(true);
        readPrintOld.parentNode.replaceChild(readPrint, readPrintOld);
        readPrint.addEventListener("click", () => {
          const versesEl = document.getElementById("read-verses");
          if (!versesEl) return;
          let printHtml = '<html><head><title>' + escapeHtml(data.bookFullName || BOOK_FULL_TITLES[book] || book) + ' Chapter ' + chapter + '</title>';
          printHtml += '<style>';
          printHtml += 'body{font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:0 20px;line-height:1.8;orphans:3;widows:3;}';
          printHtml += '.ref{font-size:20px;font-weight:bold;text-align:center;margin-bottom:12px;margin-top:0;letter-spacing:0.5px;page-break-after:avoid;}';
          printHtml += '.chapter-num{text-align:center;font-size:15px;font-weight:600;margin-bottom:20px;margin-top:0;page-break-after:avoid;}';
          printHtml += '.verse{margin:12px 0;line-height:1.9;page-break-inside:avoid;} .vn{font-size:10px;vertical-align:super;color:#666;}';
          printHtml += '.pilcrow{color:#000;font-weight:600;font-size:16px;}';
          printHtml += '.section-heading{text-align:center;font-weight:bold;margin:20px 0 12px;page-break-after:avoid;}';
          printHtml += '.subscription{text-align:center;font-weight:bold;margin-top:32px;padding:16px 20px 12px;border-top:1px dashed #ccc;display:block;page-break-inside:avoid;}';
          printHtml += '.subscription em{font-style:italic;}';
          printHtml += '.superscription{text-align:center;font-weight:bold;margin-bottom:24px;page-break-after:avoid;}';
          printHtml += '.print-footer{text-align:center;font-size:11px;color:#999;margin-top:32px;padding-top:12px;border-top:1px solid #eee;page-break-inside:avoid;}';
          printHtml += '@page{margin:0.5in;orphans:3;widows:3;}';
          printHtml += '</style></head><body>';
          // Add book title and chapter number
          const printFullTitle = (data.bookFullName || BOOK_FULL_TITLES[book] || book);
          printHtml += '<div class="ref">' + escapeHtml(printFullTitle) + '</div>';
          printHtml += '<div class="chapter-num">Chapter ' + chapter + '</div>';
          // Add Psalm superscription from original source (preserves [bracket] italics)
          if (book === 'Psalms') {
            const psalmSuperscriptionPrint = (data.verses && data.verses[0] && data.verses[0].superscription) || PSALM_SUPERSCRIPTIONS[chapter];
            if (psalmSuperscriptionPrint) {
              printHtml += '<div class="superscription">¶ ' + italicizeBracketsForPrint(psalmSuperscriptionPrint) + '</div>';
            }
          }
          // Walk through verses and Hebrew headings only (superscriptions & subscriptions handled separately)
          const allEls = readContent.querySelectorAll(
            ".psalm-section-heading, .read-verse"
          );
          allEls.forEach(el => {
            if (el.classList.contains("psalm-section-heading")) {
              printHtml += '<div class="section-heading">' + escapeHtml(el.textContent.trim()) + '</div>';
            } else if (el.classList.contains("read-verse")) {
              const vn = el.querySelector('.read-verse-num');
              const vt = el.querySelector('.read-verse-text');
              printHtml += '<div class="verse">';
              if (vn) printHtml += '<span class="vn">' + vn.textContent + '</span> ';
              if (vt) printHtml += vt.innerHTML;
              printHtml += '</div>';
            }
          });
          // Add epistle subscription / colophon from original source (preserves [bracket] italics)
          const subKey = `${book}|${chapter}`;
          const colophonText = data.colophon || EPISTLE_SUBSCRIPTIONS[subKey];
          if (colophonText) {
            printHtml += '<div class="subscription">¶ ' + italicizeBracketsForPrint(String(colophonText).replace(/^\s*¶\s*/, "")) + '</div>';
          }
          printHtml += '<div class="print-footer">Printed from KJB Reader - SidePanel &mdash; kingjamesbiblereader.com/extension</div>';
          printHtml += '</body></html>';
          const printTitle = (data.bookFullName || BOOK_FULL_TITLES[book] || book) + ' Chapter ' + chapter;
          printHtmlDocument(printHtml, printTitle);
        });
      }

      // Scroll to highlighted verse
      if (highlightVerse) {
        const el = document.getElementById(`verse-${highlightVerse}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }

    } catch (e) {
      console.error("Read mode error:", e);
      const rc0 = document.getElementById('read-controls');
      if (rc0) rc0.style.display = 'none';
      setHTML(readContent, `<div class="empty-state"><p>Failed to load chapter.</p></div>`);
    } finally {
      if (manageLoading) showLoading(false);
    }
  }

  // --- Rendering ---

  // Book-name hint: shown above keyword-search results when the query is
  // exactly a book name ("Joshua"), letting the user open that book at
  // chapter 1 even though the search itself is now a text search.
  function updateBookHint(query) {
    const el = document.getElementById("results-book-hint");
    if (!el) return;
    const trimmed = String(query || "").trim();
    const book = trimmed ? KJB_API.findBook(trimmed) : null;
    if (!book || !book.name) {
      el.style.display = "none";
      setHTML(el, "");
      return;
    }
    setHTML(el, `<button class="results-book-hint-btn" id="results-book-hint-open" type="button">` +
      `“${escapeHtml(trimmed)}” is also a book — ` +
      `<span class="results-book-hint-link">open ${escapeHtml(book.name)} — Chapter 1</span></button>`);
    el.style.display = "";
    document.getElementById("results-book-hint-open")?.addEventListener("click", async () => {
      updateBookHint(null);
      // Opening the book from the hint is a clean navigation — it must not
      // inherit verse highlights left over from the keyword search that
      // surfaced the hint (e.g. "Joshua" 1:1 matching the query word).
      currentHighlightMap = {};
      await loadChapter(book.name, 1);
      switchToTab("read");
    });
  }

  function renderResults(results, query) {
    if (results.length === 0) {
      showEmptyState(resultsList, "No results found. Try a different search term.", true);
      resultCount.textContent = "";
      return;
    }

    // Chapter headers and structural records are metadata, not successful verse
    // results. If the API returns a valid chapter header plus a missing verse,
    // show "verse not found" instead of rendering an empty chapter shell.
    const missingResults = results.filter(r => r.notFound);
    const concreteVerseResults = results.filter(r =>
      !r.notFound && !r.chapterHeader && !r.superscription && !r.colophon && !r.hebrewHeading
    );
    if (missingResults.length > 0 && concreteVerseResults.length === 0) {
      const refStr = missingResults[0].ref || "Verse";
      const message = missingResults[0].missingType === "chapter" || !refStr.includes(":")
        ? `${refStr} — chapter not found.`
        : `${refStr} — verse not found.`;
      showEmptyState(resultsList, message, true);
      resultCount.textContent = "";
      return;
    }

    // Render successful records normally. Missing records in a mixed lookup are
    // retained as explicit notices after the valid verse groups.
    const validResults = results.filter(r => !r.notFound);
    if (validResults.length === 0) {
      showEmptyState(resultsList, "No results found. Try a different search term.", true);
      resultCount.textContent = "";
      return;
    }

    // Count only actual verse results (not chapter headers, superscriptions, or colophons)
    const verseResults = validResults.filter(r => !r.chapterHeader && !r.superscription && !r.colophon && !r.hebrewHeading);
    const total = verseResults[0]?.total || verseResults.length;
    resultCount.textContent = `${verseResults.length} of ${total} result${total !== 1 ? 's' : ''}`;

    // Merge structural elements (superscription, hebrewHeading, colophon) into
    // verse cards — rendered as a centered header at the top of the card.
    const htmlParts = [];
    const useChapterLayout = validResults.some(r => r.chapterHeader);
    let pendingHeader = null;
    let chapterGroupOpen = false;

    for (const r of validResults) {
      if (r.chapterHeader) {
        if (chapterGroupOpen) htmlParts.push(`</section>`);
        htmlParts.push(`<section class="result-chapter-group"><div class="result-chapter-header">${formatFullChapterHeader(r.chapterHeader, r.bookFullName)}</div><button class="btn-text result-group-copy-all" title="Copy all verses shown for this chapter">📋 Copy All</button>`);
        chapterGroupOpen = true;
        pendingHeader = null;
        continue;
      }
      if (r.superscription || r.hebrewHeading) {
        // Attach as bold header at top of next verse card
        if (r.superscription) {
          pendingHeader = (pendingHeader || "") + `<div class="result-card-structural result-card-superscription">¶ ${italicizeBrackets(r.superscription)}</div>`;
        } else {
          pendingHeader = (pendingHeader || "") + `<div class="result-card-structural result-card-hebrew-name">${escapeHtml(r.hebrewHeading)}</div>`;
        }
        continue;
      }
      if (r.colophon) {
        // Attach as footer at bottom of previous verse card
        const cleanColophon = String(r.colophon).replace(/^\s*¶\s*/, "");
        const footerHtml = `<div class="result-card-structural result-card-structural-footer"><span class="structural-pilcrow">¶</span> ${italicizeBrackets(cleanColophon)}</div>`;
        if (htmlParts.length > 0) {
          const last = htmlParts[htmlParts.length - 1];
          const closeIdx = last.lastIndexOf("</div>");
          if (closeIdx > 0) {
            htmlParts[htmlParts.length - 1] = last.slice(0, closeIdx) + footerHtml + last.slice(closeIdx);
          } else {
            htmlParts.push(footerHtml);
          }
        } else {
          htmlParts.push(footerHtml);
        }
        continue;
      }
      // Verse card — place structural text below the verse reference/actions
      // and immediately above the verse text.
      const cardHtml = renderResultCard(r, query, useChapterLayout);
      if (pendingHeader) {
        const verseTextMarker = '<div class="result-text">';
        const verseTextIdx = cardHtml.indexOf(verseTextMarker);
        if (verseTextIdx >= 0) {
          htmlParts.push(cardHtml.slice(0, verseTextIdx) + pendingHeader + cardHtml.slice(verseTextIdx));
        } else {
          htmlParts.push(cardHtml);
        }
        pendingHeader = null;
      } else {
        htmlParts.push(cardHtml);
      }
    }
    // Leftover header with no verse after it
    if (pendingHeader) htmlParts.push(pendingHeader);
    if (chapterGroupOpen) htmlParts.push(`</section>`);

    // A mixed lookup can contain valid verses and invalid verse numbers. Do not
    // silently discard the invalid references.
    for (const missing of missingResults) {
      const refStr = missing.ref || "Verse";
      const message = missing.missingType === "chapter" || !refStr.includes(":")
        ? `${refStr} — chapter not found.`
        : `${refStr} — verse not found.`;
      htmlParts.push(`<div class="result-not-found">${escapeHtml(message)}</div>`);
    }

    setHTML(resultsList, htmlParts.join(""));
    attachCardEvents();
    // Show results controls if we have cards
    const resultsCtrls = document.getElementById("results-controls");
    if (resultsCtrls) resultsCtrls.style.display = resultsList.querySelector(".result-card") ? "" : "none";
    // Each chapter/book group gets its own "Copy All" button (a mixed
    // multi-reference search can show several different chapters at once —
    // a single button copying everything would wrongly merge verses from
    // different chapters together with no separation). Hide a group's
    // button when it has only one verse, since that verse's own per-verse
    // copy button already covers it.
    resultsList.querySelectorAll(".result-chapter-group").forEach(section => {
      const btn = section.querySelector(".result-group-copy-all");
      const count = section.querySelectorAll(".result-card-chapter-layout").length;
      if (btn) btn.style.display = count > 1 ? "" : "none";
    });
    // The toolbar's global "Copy All" (beside Select) copies every group
    // together, each clearly separated — useful when there's more than one
    // verse total, whether that's one chapter or several mixed references.
    const totalChapterCards = resultsList.querySelectorAll(".result-card-chapter-layout").length;
    const globalCopyAllBtn = document.getElementById("results-copy-all");
    if (globalCopyAllBtn) globalCopyAllBtn.style.display = totalChapterCards > 1 ? "" : "none";
    // If select mode was active, re-apply
    if (resultsSelectMode) {
      toggleResultsSelectMode(); // turn off
      toggleResultsSelectMode(); // turn back on to re-add checkboxes
    }
  }

  function renderResultCard(r, query, useChapterLayout = false) {
    const formattedText = formatVerseText(r.text, query);
    const webLink = r.readUrl
      ? `<button class="btn-link" data-url="${escapeHtml(r.readUrl)}" title="Open on KJB Reader">↗</button>`
      : "";
    const actions = `
      <div class="result-actions${useChapterLayout ? ' result-actions-floating' : ''}">
        <button class="btn-copy" title="Copy">📋</button>
        ${webLink}
      </div>`;
    const heading = useChapterLayout
      ? actions
      : `<div class="result-header">
          <span class="result-ref">${escapeHtml(r.ref)} (KJB)</span>
          ${actions}
        </div>`;
    const verseNumber = useChapterLayout && r.verse
      ? `<span class="result-verse-num">${escapeHtml(String(r.verse))}</span>`
      : "";
    const verseBody = useChapterLayout
      ? `<span class="result-verse-body">${formattedText}</span>`
      : formattedText;
    return `
      <div class="result-card${useChapterLayout ? ' result-card-chapter-layout' : ''}" data-ref="${escapeHtml(r.ref)}" data-text="${escapeHtml(r.text)}" data-book="${escapeHtml(r.book || '')}" data-chapter="${r.chapter || ''}" data-verse="${r.verse || ''}">
        ${heading}
        <div class="result-text">${verseNumber}${verseBody}</div>
      </div>
    `;
  }

  function formatVerseText(rawText, query) {
    if (!rawText) return '';
    let text = escapeHtml(rawText);

    // Render pilcrows — show them all as styled markers
    text = text.replace(/¶/g, '<span class="pilcrow">¶</span>');

    // Render brackets as italics
    text = text.replace(/\[([^\]]*)\]/g, '<em>$1</em>');

    // Highlight search terms
    if (query) {
      text = highlightTerms(text, query);
    }

    return text;
  }

  // Punctuation attached to the tail of a match is highlighted together with
  // the term, so a hit reads as "grace," with the comma inside the mark
  // instead of the mark stopping one character short of it. Apostrophes are
  // deliberately NOT in this class: in "God’s" the apostrophe belongs to the
  // word, so a search for "God" must not swallow it and strand the "s".
  const TRAILING_PUNCT = "[,.:;!?…\"“”()]*";

  // Apostrophe style must not decide a highlight: typed queries use the ASCII
  // apostrophe while the source text prints the typographic right quote
  // (U+2019). Either form matches both.
  const aposInsensitive = (pattern) => pattern.replace(/['’]/g, "['’]");

  // Æ-ligature equivalences. The source prints the ligature ("Ænon",
  // "Judæa", "Cæsar", "Galilæan") while readers type the letters
  // out ("AEnon", "Judaea", "Caesar") or use modern spellings ("Enon",
  // "Judea", "Galileans"). Results carry the SOURCE spelling, so the highlight
  // must cover every form the term can take.
  const LIGATURE_SPELLINGS = {
    judea: "judæa", enon: "ænon", galilean: "galilæan",
    galileans: "galilæans", thaddeus: "thaddæus", chaldeans: "chaldæans"
  };
  const ligatureForms = (term) => {
    const forms = [term];
    const swapped = term.replace(/[Aa][Ee]/g, (m) =>
      m === m.toLowerCase() ? "æ" : m === m.toUpperCase() ? "Æ" : (m[0] === m[0].toUpperCase() ? "Æ" : "æ"));
    if (swapped !== term) forms.push(swapped);
    const mapped = LIGATURE_SPELLINGS[term.toLowerCase()];
    if (mapped) {
      forms.push(mapped);
      if (term[0] === term[0].toUpperCase()) forms.push(mapped.charAt(0).toUpperCase() + mapped.slice(1));
    }
    return [...new Set(forms)];
  };

  function highlightTerms(html, query) {
    const hasSpecial = KJB_API.hasLiteralSpecialChars(query);
    const wildcard = optWildcard.checked && !hasSpecial;

    let terms = [];

    if (wildcard && (query.includes('?') || query.includes('*'))) {
      const pattern = aposInsensitive(escapeRegexForWildcard(query)) + TRAILING_PUNCT;
      try {
        const re = new RegExp(`(${pattern})`, optCaseSensitive.checked ? 'g' : 'gi');
        return highlightWithRegex(html, re);
      } catch (e) {
        return html;
      }
    } else if (hasSpecial) {
      terms = [query];
    } else {
      terms = query.split(/[\s,]+/).filter(t => t.length > 0);
    }

    terms.forEach(term => {
      if (!term || term.length < 1) return;
      const ligForms = hasSpecial ? [term] : ligatureForms(term);
      const termPattern = ligForms.length > 1
        ? `(?:${ligForms.map((f) => aposInsensitive(escapeRegex(f))).join("|")})`
        : aposInsensitive(escapeRegex(term));
      let pattern;
      if (hasSpecial) {
        pattern = termPattern + TRAILING_PUNCT;
      } else if (optWholeWord.checked) {
        // The whole-word lookahead must still bind directly to the term —
        // trailing punctuation is only consumed after the word boundary holds.
        // Both apostrophe forms AND both ligature forms sit in the boundary
        // class so "God" whole-word never matches inside "God’s" and "non"
        // whole-word never matches inside "Ænon", however they are printed.
        pattern = `(?<![A-Za-z'’Ææ-])${termPattern}(?![A-Za-z'’Ææ-])${TRAILING_PUNCT}`;
      } else {
        pattern = termPattern + TRAILING_PUNCT;
      }
      try {
        const re = new RegExp(`(${pattern})`, optCaseSensitive.checked ? 'g' : 'gi');
        html = highlightWithRegex(html, re);
      } catch (e) {}
    });

    return html;
  }

  function highlightWithRegex(html, regex) {
    const parts = html.split(/(<[^>]+>)/);
    const globalRegex = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
    let result = '';
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith('<')) {
        result += parts[i];
      } else {
        result += parts[i].replace(globalRegex, '<mark class="search-highlight">$1</mark>');
      }
    }
    return result;
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function escapeRegexForWildcard(str) {
    return str.replace(/[.*+^${}()|[\]\\]/g, (m) => {
      if (m === '?') return '.';
      if (m === '*') return '.*';
      return '\\' + m;
    });
  }

  // Builds text for the toolbar's global "Copy All" — every chapter/book
  // group shown, each built the same way as its own per-group button, with
  // clear separation between groups so different chapters/books never run
  // together.
  function buildAllResultsCopyText() {
    const sections = resultsList.querySelectorAll(".result-chapter-group");
    const parts = [];
    sections.forEach(section => {
      const t = buildResultsChapterCopyText(section);
      if (t) parts.push(t);
    });
    return parts.join("\n\n\n");
  }

  // Builds the same kind of full-chapter text as the Read tab's "Copy
  // Chapter", scoped to a single .result-chapter-group section — a mixed
  // multi-reference search can show several different chapters at once, so
  // each group's own button must only copy that group's own verses.
  function buildResultsChapterCopyText(section) {
    const cards = section.querySelectorAll(".result-card-chapter-layout");
    if (cards.length === 0) return "";
    const firstCard = cards[0];
    const book = firstCard.dataset.book || "";
    const chapter = firstCard.dataset.chapter || "";
    // A "chapter group" here just means "verses sharing one book+chapter" —
    // a search that only turned up a single verse in that chapter still
    // gets grouped this way, but stacking a full title + "Chapter N"
    // header over one line reads like a whole-chapter copy when it isn't.
    // Match the single-verse copy button's own format instead: a quoted
    // line with the reference and (KJB) tag, nothing stacked above it.
    if (cards.length === 1) {
      const card = firstCard;
      const ref = card.dataset.ref || "";
      const plainText = cleanVerseTextForCopy(card.dataset.text || "");
      const structHeader = card.querySelector(".result-card-superscription, .result-card-hebrew-name");
      const headerLine = structHeader
        ? centerLine(bracketedTextFromElement(structHeader), 1) + "\n"
        : "";
      const footer = card.querySelector(".result-card-structural-footer");
      const footerText = footer ? " " + bracketedTextFromElement(footer) : "";
      return `\u201c${headerLine}${plainText}${footerText}\u201d - ${ref} (KJB)`;
    }
    // Multi-verse: the centered chapter block, matching the Read tab's
    // "Copy Chapter" — full title and "Chapter N" centered over the verses.
    const fullTitle = BOOK_FULL_TITLES[book] || book;
    let text = fullTitle ? centerLine(fullTitle) + "\n" + centerLine(`Chapter ${chapter}`) + "\n\n" : "";
    cards.forEach(card => {
      const structHeader = card.querySelector(".result-card-superscription, .result-card-hebrew-name");
      if (structHeader) {
        text += centerLine(bracketedTextFromElement(structHeader)) + "\n\n";
      }
      const verseNum = card.querySelector(".result-verse-num");
      // Prefer the raw source text (data-text) over the rendered DOM text,
      // since rendering converts [brackets] into <em> tags for display —
      // the raw attribute keeps the brackets plain-text copy needs.
      const bodyText = mergeAdjacentItalics((card.dataset.text || (card.querySelector(".result-verse-body")?.textContent || "")).trim().replace(/\s+/g, ' '));
      text += (verseNum ? verseNum.textContent + " " : "") + bodyText + "\n";
      const footer = card.querySelector(".result-card-structural-footer");
      if (footer) {
        text += "\n" + centerLine(bracketedTextFromElement(footer)) + "\n";
      }
    });
    return text.replace(/[\s]+$/, '');
  }

  function attachCardEvents() {
    resultsList.querySelectorAll(".result-card").forEach(card => {
      const ref = card.dataset.ref;
      const text = card.dataset.text;

      card.querySelector(".btn-copy")?.addEventListener("click", (e) => {
        e.stopPropagation();
        const plainText = cleanVerseTextForCopy(text);
        // Include this verse's own Psalm superscription / Hebrew section
        // name centered above the quote, and fold any epistle colophon into
        // the SAME quoted text (not after the reference) since it's part of
        // the verse being quoted, not a separate citation.
        const structHeader = card.querySelector(".result-card-superscription, .result-card-hebrew-name");
        const headerLine = structHeader
          ? centerLine(bracketedTextFromElement(structHeader), 1) + "\n"
          : "";
        const footer = card.querySelector(".result-card-structural-footer");
        const footerText = footer ? " " + bracketedTextFromElement(footer) : "";
        copyToClipboard(`“${headerLine}${plainText}${footerText}” - ${ref} (KJB)`).then(() => {
          e.target.textContent = "✓";
          setTimeout(() => e.target.textContent = "📋", 1500);
        }).catch((e) => {
          console.warn("[KJB] Copy failed:", e);
          e.target.textContent = "✗";
          setTimeout(() => e.target.textContent = "📋", 1500);
        });
      });

      card.querySelector(".btn-link")?.addEventListener("click", (e) => {
        e.stopPropagation();
        const url = e.target.dataset.url;
        if (url) chrome.tabs.create({ url });
      });

      card.addEventListener("click", () => {
        if (resultsSelectMode) return; // don't open verse in select mode
        const bk = card.dataset.book;
        const ch = parseInt(card.dataset.chapter, 10);
        // If we have book/chapter and a highlight map entry, load Read mode directly
        if (bk && ch && currentHighlightMap[`${bk}:${ch}`]) {
          const ranges = currentHighlightMap[`${bk}:${ch}`];
          const firstRange = ranges[0];
          const hlEnd = firstRange[0] !== firstRange[1] ? firstRange[1] : null;
          loadChapter(bk, ch, firstRange[0], hlEnd, null);
          switchToTab("read");
        } else {
          searchInput.value = ref;
          doSearch(ref);
        }
      });

      // If select mode is active, add checkbox
      if (resultsSelectMode) {
        card.classList.add("selectable");
        if (!card.querySelector(".select-checkbox")) {
          const cb = document.createElement("div");
          cb.className = "select-checkbox";
          cb.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleCardSelection(card);
          });
          card.insertBefore(cb, card.firstChild);
          if (selectedRefs.has(card.dataset.ref)) {
            card.classList.add("selected");
          }
        }
      }
    });
  }

  // --- Results multi-select mode ---
  let resultsSelectMode = false;
  const selectedRefs = new Set();

  function toggleResultsSelectMode() {
    resultsSelectMode = !resultsSelectMode;
    const selectBtn = document.getElementById("results-select");
    const copyBtn = document.getElementById("results-copy-selected");
    const clearBtn = document.getElementById("results-clear-selected");

    if (resultsSelectMode) {
      selectBtn.classList.add("active");
      selectBtn.textContent = "Done";
      copyBtn.style.display = "";
      clearBtn.style.display = "";
      resultsList.querySelectorAll(".result-card").forEach(card => {
        card.classList.add("selectable");
        if (!card.querySelector(".select-checkbox")) {
          const cb = document.createElement("div");
          cb.className = "select-checkbox";
          cb.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleCardSelection(card);
          });
          card.insertBefore(cb, card.firstChild);
        }
      });
      showSelectBar();
    } else {
      selectBtn.classList.remove("active");
      selectBtn.textContent = "Select";
      copyBtn.style.display = "none";
      clearBtn.style.display = "none";
      resultsList.querySelectorAll(".result-card").forEach(card => {
        card.classList.remove("selectable", "selected");
        const cb = card.querySelector(".select-checkbox");
        if (cb) cb.remove();
      });
      selectedRefs.clear();
      hideSelectBar();
    }
    updateSelectCount();
  }

  function toggleCardSelection(card) {
    const ref = card.dataset.ref;
    if (!ref) return;
    if (selectedRefs.has(ref)) {
      selectedRefs.delete(ref);
      card.classList.remove("selected");
    } else {
      selectedRefs.add(ref);
      card.classList.add("selected");
    }
    updateSelectCount();
  }

  function updateSelectCount() {
    const bar = document.getElementById("results-select-bar");
    if (!bar) return;
    const count = selectedRefs.size;
    const countEl = bar.querySelector(".results-select-count");
    if (countEl) countEl.textContent = count === 0 ? "No verses selected" : count + " verse" + (count > 1 ? "s" : "") + " selected";
    const copyBtn = bar.querySelector(".btn-copy-go");
    if (copyBtn) copyBtn.disabled = count === 0;
  }

  function showSelectBar() {
    let bar = document.getElementById("results-select-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "results-select-bar";
      bar.className = "results-select-bar";
      bar.innerHTML = '<span class="results-select-count">No verses selected</span>' +
        '<div class="select-bar-actions">' +
        '<button class="btn-text btn-copy-go" id="select-copy-go">\u{1F4CB} Copy</button>' +
        '<button class="btn-text" id="select-cancel">Cancel</button>' +
        '</div>';
      document.getElementById("tab-results").appendChild(bar);
      bar.querySelector("#select-copy-go").addEventListener("click", copySelectedVerses);
      bar.querySelector("#select-cancel").addEventListener("click", () => toggleResultsSelectMode());
    }
    bar.style.display = "";
  }

  function hideSelectBar() {
    const bar = document.getElementById("results-select-bar");
    if (bar) bar.style.display = "none";
  }

  function copySelectedVerses() {
    if (selectedRefs.size === 0) return;
    // Group selected verses by book+chapter so verses from the same chapter
    // are combined into one paragraph with a range reference.
    const groups = {};
    const order = [];
    resultsList.querySelectorAll(".result-card.selected").forEach(card => {
      const ref = card.dataset.ref || "";
      const rawText = card.dataset.text || "";
      const plainText = cleanVerseTextForCopy(rawText);
      // Include this card's own Psalm superscription/Hebrew name and/or
      // epistle colophon, same as the single-verse copy button does.
      const structHeader = card.querySelector(".result-card-superscription, .result-card-hebrew-name");
      const headerText = structHeader ? bracketedTextFromElement(structHeader) : null;
      const footer = card.querySelector(".result-card-structural-footer");
      const footerText = footer ? bracketedTextFromElement(footer) : null;
      // Parse "Book Chapter:Verse" — book may contain leading number (e.g. "1 John 3:1")
      const m = ref.match(/^(.+?)\s+(\d+):(\d+)$/);
      if (m) {
        const key = m[1] + " " + m[2];
        if (!groups[key]) { groups[key] = { book: m[1], chapter: m[2], verses: [] }; order.push(key); }
        groups[key].verses.push({ verse: parseInt(m[3]), text: plainText, header: headerText, footer: footerText });
      } else {
        // Unparseable ref — add as standalone entry
        const key = "__" + ref;
        if (!groups[key]) {
          const headerLine = headerText ? centerLine(headerText, 1) + "\n" : "";
          const footerBit = footerText ? " " + footerText : "";
          groups[key] = { book: null, chapter: null, verses: [], single: "\u201c" + headerLine + plainText + footerBit + "\u201d - " + ref + " (KJB)" };
          order.push(key);
        }
      }
    });
    const parts = [];
    for (const key of order) {
      const g = groups[key];
      if (g.single) { parts.push(g.single); continue; }
      g.verses.sort((a, b) => a.verse - b.verse);
      // A heading belongs to whichever verse it precedes (typically the
      // first selected verse); a colophon belongs to whichever verse it
      // follows (typically the last). Only look at the group's first/last
      // verse for each, so a heading on an earlier unselected verse (or a
      // colophon on a later one) never leaks in.
      const headerText = g.verses[0].header;
      const footerText = g.verses[g.verses.length - 1].footer;
      const headerLine = headerText ? centerLine(headerText, 1) + "\n" : "";
      const footerBit = footerText ? " " + footerText : "";
      if (g.verses.length === 1) {
        parts.push("\u201c" + headerLine + g.verses[0].text + footerBit + "\u201d - " + g.book + " " + g.chapter + ":" + g.verses[0].verse + " (KJB)");
      } else {
        const isConsecutive = g.verses.every((v, i) => i === 0 || v.verse === g.verses[i - 1].verse + 1);
        if (!isConsecutive) {
          // A NON-consecutive selection must never claim a range it does not
          // cover (quoting verses 21 and 37 as if 21-37 were all selected), so
          // it copies as a whole like "Copy All" instead: centered title and
          // "Chapter N", then one verse per line with its verse number — the
          // numbers make the gaps explicit.
          const fullTitle = BOOK_FULL_TITLES[g.book] || g.book;
          let block = centerLine(fullTitle) + "\n" + centerLine(`Chapter ${g.chapter}`) + "\n\n";
          g.verses.forEach(v => {
            if (v.header) block += centerLine(v.header) + "\n\n";
            block += v.verse + " " + v.text + "\n";
            if (v.footer) block += "\n" + centerLine(v.footer) + "\n";
          });
          parts.push(block.replace(/[\s]+$/, ''));
        } else {
          // Consecutive selections keep the consolidated paragraph with a
          // range reference.
          const combined = g.verses.map(v => v.text).join(" ");
          const first = g.verses[0].verse;
          const last = g.verses[g.verses.length - 1].verse;
          const refStr = first === last
            ? g.book + " " + g.chapter + ":" + first
            : g.book + " " + g.chapter + ":" + first + "-" + last;
          parts.push("\u201c" + headerLine + combined + footerBit + "\u201d - " + refStr + " (KJB)");
        }
      }
    }
    const text = parts.join("\n\n");
    copyToClipboard(text).then(() => {
      // Show checkmark on both the toolbar button and the floating bar button
      const toolbarBtn = document.getElementById("results-copy-selected");
      const barBtn = document.getElementById("select-copy-go");
      for (const btn of [toolbarBtn, barBtn]) {
        if (!btn) continue;
        const orig = btn.textContent;
        btn.textContent = "\u2713 Copied!";
        setTimeout(() => { btn.textContent = orig; }, 1500);
      }
    }).catch((e) => {
      console.warn("[KJB] Batch copy failed:", e);
    });
  }

  function showEmptyState(container, message, reportLookupTrouble = false) {
    // Empty search results can also mean a lookup bug (a word the source prints
    // with special typography a query cannot reach). The report line invites
    // the user to flag suspected errors so nothing silently fails to be found.
    setHTML(container, `<div class="empty-state"><p>${escapeHtml(message)}</p>${
      reportLookupTrouble
        ? `<p class="hint">If you think this is an error, please email <a href="mailto:kingjamesbiblereader@outlook.sg">kingjamesbiblereader@outlook.sg</a></p>`
        : ""
    }</div>`);
  }

  function showLoading(show) {
    const contentArea = document.querySelector(".content-area");
    const readCtrls = document.getElementById("read-controls");
    loading.classList.toggle("hidden", !show);
    contentArea?.classList.toggle("is-loading", show);
    loading.setAttribute("aria-busy", show ? "true" : "false");

    if (show) {
      // Hide all stale output immediately; only the searching animation remains
      // in the content pane until the destination has fully rendered.
      resultCount.style.display = "none";
      if (readCtrls) readCtrls.style.display = "none";
      if (contentArea) contentArea.scrollTop = 0;
      return;
    }

    const activeTab = document.querySelector(".tab.active")?.dataset.tab;
    resultCount.style.display = activeTab === "results" ? "" : "none";
    if (readCtrls) {
      const hasChapter = Boolean(readContent.querySelector(".read-verses"));
      readCtrls.style.display = activeTab === "read" && hasChapter ? "" : "none";
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function timeAgo(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  // --- Gospel & Resources ---


  // Make verse references clickable inside info pages (Gospel, Resources, About)
  function makeVerseRefsClickable(el) {
    // Regex to match Bible references at the end of text, preceded by —
    // Matches: — Romans 3:20, — 1 Corinthians 15:1-4, — Psalm 9:17, — 2 Timothy 2:15
    const refRegex = /—\s*((?:[1-3]\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(\d+):(\d+(?:-\d+)?)/g;

    // Walk text nodes and wrap matches
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (!node.nodeValue || !refRegex.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
        refRegex.lastIndex = 0; // reset
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const nodesToProcess = [];
    while (walker.nextNode()) nodesToProcess.push(walker.currentNode);

    nodesToProcess.forEach(textNode => {
      const text = textNode.nodeValue;
      refRegex.lastIndex = 0;
      let lastIndex = 0;
      let match;
      const frag = document.createDocumentFragment();

      while ((match = refRegex.exec(text)) !== null) {
        // Text before the match
        if (match.index > lastIndex) {
          frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }

        const fullRef = match[1] + ' ' + match[2] + ':' + match[3];

        const link = document.createElement('a');
        link.className = 'verse-ref-link';
        link.textContent = match[0]; // includes the — prefix
        link.dataset.ref = fullRef;
        link.addEventListener('click', async (e) => {
          e.preventDefault();
          searchInput.value = fullRef;
          // Use the canonical parser and verified lookup flow. Singular verses
          // open Results; true ranges open Read with all returned verses marked.
          await doSearch(fullRef, { openVerseRangeInRead: true });
        });
        frag.appendChild(link);

        lastIndex = match.index + match[0].length;
      }

      // Remaining text
      if (lastIndex < text.length) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex)));
      }

      textNode.parentNode.replaceChild(frag, textNode);
    });
  }

  // --- Plain-text export for the Gospel / Resources pages ---------------
  // innerText scraping pulled in the toolbar ("📋 Copy 🖨 Print"), lost every
  // link URL and produced one undifferentiated wall of text. This walks the
  // DOM instead: skips UI chrome, keeps block structure, and expands links.
  function infoPageToText(root) {
    if (!root) return "";
    const BLOCK_SEL = "p,div,h1,h2,h3,h4,h5,h6,ul,ol,li,blockquote,section,article,table";
    const lines = [];

    const isSkipped = (el) =>
      el.tagName === "BUTTON" || el.tagName === "SCRIPT" || el.tagName === "STYLE" ||
      (el.classList && (el.classList.contains("info-toolbar") || el.classList.contains("btn-text")));

    const tidy = (s) => s.replace(/\u2197/g, "")
                         .replace(/[ \t\u00a0]+/g, " ")
                         .replace(/ *\n */g, "\n")
                         .trim();

    function inlineText(el) {
      let out = "";
      el.childNodes.forEach((n) => {
        if (n.nodeType === 3) { out += n.textContent; return; }
        if (n.nodeType !== 1) return;
        if (isSkipped(n)) return;
        if (n.tagName === "BR") { out += "\n"; return; }
        if (n.tagName === "A") {
          const label = tidy(n.textContent);
          const url = (n.dataset && n.dataset.url) || n.getAttribute("href") || "";
          if (!url || url === "#") { out += label; return; }
          if (!label) { out += url.replace(/^mailto:/i, ""); return; }
          // mailto: links normally use the address itself as the label —
          // printing "addr: mailto:addr" listed the same email twice.
          if (/^mailto:/i.test(url)) {
            const addr = url.replace(/^mailto:/i, "").trim();
            out += (label.toLowerCase() === addr.toLowerCase()) ? addr : (label + ": " + addr);
            return;
          }
          // If the label is already the domain (e.g. "thecloudchurch.org"),
          // don't write it twice — just emit the URL.
          const bare = label.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
          const urlBare = url.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
          out += (/\./.test(label) && urlBare.startsWith(bare)) ? url : (label + ": " + url);
          return;
        }
        out += inlineText(n);
      });
      return out;
    }

    const blank = () => { if (lines.length && lines[lines.length - 1] !== "") lines.push(""); };

    function walk(el) {
      Array.from(el.childNodes).forEach((node) => {
        if (node.nodeType === 3) {
          const t = tidy(node.textContent);
          if (t) lines.push(t);
          return;
        }
        if (node.nodeType !== 1 || isSkipped(node)) return;
        const tag = node.tagName;

        if (/^H[1-6]$/.test(tag)) {
          blank();
          const t = tidy(inlineText(node));
          if (t) { lines.push(t); blank(); }
          return;
        }
        if (tag === "P" || tag === "BLOCKQUOTE") {
          const t = tidy(inlineText(node));
          if (t) { lines.push(t); blank(); }
          return;
        }
        if (tag === "LI") {
          const t = tidy(inlineText(node)).replace(/\n+/g, " ");
          if (t) lines.push("\u2022 " + t);
          return;
        }
        if (tag === "UL" || tag === "OL") { walk(node); blank(); return; }
        if (tag === "BR") return;

        // Generic container: if it holds no block-level children, emit it as a
        // single line (keeps preacher rows and link rows on one line each).
        if (!node.querySelector(BLOCK_SEL)) {
          const t = tidy(inlineText(node));
          if (t) t.split("\n").forEach((piece) => { if (piece.trim()) lines.push(piece.trim()); });
          return;
        }
        walk(node);
        if (node.classList && (node.classList.contains("info-step") ||
                               node.classList.contains("info-section") ||
                               node.classList.contains("info-box"))) blank();
      });
    }

    walk(root);
    const body = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    return body + "\n\nCopied from KJB Reader Web Extension \u2014 kingjamesbiblereader.com/extension";
  }

  function printInfoPage(pageEl) {
    // Get the page title from the h2
    const titleEl = pageEl.querySelector('h2');
    const pageTitle = titleEl ? titleEl.textContent : 'KJB Reader - SidePanel';

    const printHtml = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<title>' + escapeHtml(pageTitle) + '</title>' +
      '<style>' +
      '@page { margin: 1.5cm; }' +
      'body{font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:0;line-height:1.7;}' +
      'h2{font-size:20px;text-align:center;margin-bottom:16px;}' +
      'h3{font-size:16px;margin-top:24px;page-break-after:avoid;}' +
      '.info-intro{font-style:italic;}' +
      '.info-highlight{font-weight:bold;background:#fffde7;padding:8px 12px;border-left:3px solid #fdd835;}' +
      '.info-quote{border-left:3px solid #ccc;padding-left:12px;margin:12px 0;font-style:italic;}' +
      '.info-step{margin:16px 0;page-break-inside:avoid;}' +
      '.info-box{background:#f5f5f5;padding:12px;border-radius:4px;margin:16px 0;page-break-inside:avoid;}' +
      '.info-box ul{padding-left:20px;}' +
      '.info-section{margin:16px 0;page-break-inside:avoid;}' +
      '.preacher{margin:8px 0;}' +
      '.info-disclaimer{font-size:12px;color:#666;margin-top:24px;}' +
      '.info-toolbar{display:none;}' +
      'a{color:#333;text-decoration:none;}' +
      '.print-footer{text-align:center;font-size:11px;color:#999;margin-top:32px;padding-top:12px;border-top:1px solid #eee;}' +
      '.print-footer a{color:#999;}' +
      '</style></head><body>' +
      pageEl.innerHTML +
      '<div class="print-footer">Printed from KJB Reader - SidePanel &mdash; <a href="https://kingjamesbiblereader.com/extension">kingjamesbiblereader.com/extension</a></div>' +
      '</body></html>';

    printHtmlDocument(printHtml, pageTitle);
  }

  function renderGospel() {
    const el = document.getElementById("gospel-content");
    if (!el) return;

    setHTML(el, `
      <div class="info-page">
        <div class="info-toolbar">
          <button class="btn-text" id="gospel-copy" title="Copy all text">📋 Copy</button>
          <button class="btn-text" id="gospel-print" title="Print this page">🖨 Print</button>
        </div>
        <h2>How to be Saved</h2>
        <p class="info-intro">The Gospel is the glad tidings of the Lord Jesus Christ:</p>
        <p class="info-highlight">Trust he is God, died, shed his blood, buried and rose again on the third day for our sins according to the scriptures.</p>
        <blockquote class="info-quote">"Study to shew thyself approved unto God, a workman that needeth not to be ashamed, rightly dividing the word of truth."<br>— 2 Timothy 2:15</blockquote>

        <div class="info-step">
          <h3>1. Believe you are a sinner that deserves hell</h3>
          <p>"Therefore by the deeds of the law there shall no flesh be justified in his sight: for by the law is the knowledge of sin." — Romans 3:20</p>
          <p>"The wicked shall be turned into hell, and all the nations that forget God." — Psalm 9:17</p>
        </div>

        <div class="info-step">
          <h3>2. Believe that Jesus is God manifested in the flesh</h3>
          <p>"And without controversy great is the mystery of godliness: God was manifest in the flesh, justified in the Spirit, seen of angels, preached unto the Gentiles, believed on in the world, received up into glory." — 1 Timothy 3:16</p>
        </div>

        <div class="info-step">
          <h3>3. Believe he died, shed his blood, was buried and rose again for our sins according to the scriptures</h3>
          <p>"Moreover, brethren, I declare unto you the gospel which I preached unto you, which also ye have received, and wherein ye stand; By which also ye are saved, if ye keep in memory what I preached unto you, unless ye have believed in vain. For I delivered unto you first of all that which I also received, how that Christ died for our sins according to the scriptures; And that he was buried, and that he rose again the third day according to the scriptures." — 1 Corinthians 15:1-4</p>
          <p>"Whom God hath set forth to be a propitiation through faith in his blood, to declare his righteousness for the remission of sins that are past, through the forbearance of God;" — Romans 3:25</p>
        </div>

        <div class="info-box">
          <h3>These do NOT make you a Christian:</h3>
          <ul>
            <li>Repenting of sins</li>
            <li>Making Jesus Lord</li>
            <li>Being a member of a church</li>
            <li>Tithing</li>
            <li>Being baptised (water)</li>
            <li>Saying a sinner's prayer</li>
            <li>Confessing with your mouth</li>
            <li>Lordship Salvation</li>
          </ul>
        </div>

        <div class="info-section">
          <h3>Once Saved, Always Saved</h3>
          <p>A believer who has trusted the gospel cannot lose salvation, no matter what happens in their life. God's gift of eternal life is just that — eternal.</p>
          <p>"In whom ye also trusted, after that ye heard the word of truth, the gospel of your salvation: in whom also after that ye believed, ye were sealed with that holy Spirit of promise." — Ephesians 1:13</p>
        </div>

        <div class="info-section">
          <h3>Watch the Gospel</h3>
          <p><a href="#" class="info-link" data-url="https://www.youtube.com/results?search_query=robert+breaker+gospel+that+saves">THE GOSPEL THAT SAVES — Robert Breaker (YouTube)</a></p>
        </div>

        <div class="info-section">
          <h3>KJBI.org — Free Online Bible College</h3>
          <p>King James Bible Institute by Robert Breaker & Robert Potthoff — a free online Bible college for those who want to go deeper in God's Word.</p>
          <p><a href="#" class="info-link" data-url="https://kjbi.org">Visit KJBI.org ↗</a></p>
        </div>

        <div class="info-section">
          <h3>Verified KJB Preachers</h3>
          <div class="preacher-list">
            <div class="preacher"><strong>Robert Breaker</strong> — KJB missionary evangelist<br><a href="#" class="info-link" data-url="https://youtube.com/@thecloudchurch">YouTube</a> · <a href="#" class="info-link" data-url="https://tiktok.com/@robertbreaker">TikTok</a> · <a href="#" class="info-link" data-url="https://thecloudchurch.org">thecloudchurch.org</a></div>
            <div class="preacher"><strong>Robert Potthoff</strong> — Big Red Preacher, KJB soul winner<br><a href="#" class="info-link" data-url="https://instagram.com/robertpotthoff">Instagram</a> · <a href="#" class="info-link" data-url="https://facebook.com/robert.potthoff">Facebook</a></div>
            <div class="preacher"><strong>Ryan Poff</strong> — Seed of Hope Church, KJB pastor<br><a href="#" class="info-link" data-url="https://seedofhopechurch.org">seedofhopechurch.org</a> · <a href="#" class="info-link" data-url="https://youtube.com/@seedofhopechurch">YouTube</a></div>
            <div class="preacher"><strong>Skyler (AV1611 Ministry)</strong> — KJB defence and preaching<br><a href="#" class="info-link" data-url="https://tiktok.com/@av1611ministry">TikTok</a> · <a href="#" class="info-link" data-url="https://youtube.com/@av1611ministry">YouTube</a></div>
            <div class="preacher"><strong>Crown of Thorns</strong> — KJB preaching on YouTube<br><a href="#" class="info-link" data-url="https://youtube.com/@crownofthorns">YouTube</a></div>
            <div class="preacher"><strong>Paul Johnson</strong> — Biblical Salvation, KJB teaching<br><a href="#" class="info-link" data-url="https://tiktok.com/@biblicalsalvation">TikTok</a> · <a href="#" class="info-link" data-url="https://youtube.com/@biblicalsalvation">YouTube</a></div>
            <div class="preacher"><strong>CPR Missions</strong> — Church planting and revival<br><a href="#" class="info-link" data-url="https://youtube.com/@cprmissions">YouTube</a> · <a href="#" class="info-link" data-url="https://tiktok.com/@cprmissions">TikTok</a></div>
            <div class="preacher"><strong>James Bray</strong> — KJB preacher and Bible teacher<br><a href="#" class="info-link" data-url="https://youtube.com/@jamesbray">YouTube</a></div>
          </div>
        </div>

        <div class="info-section">
          <h3>Contact</h3>
          <p><a href="mailto:kingjamesbiblereader@outlook.sg" class="info-link">kingjamesbiblereader@outlook.sg</a></p>
        </div>

      </div>
    `);

    // Bind links
    el.querySelectorAll(".info-link").forEach(link => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: link.dataset.url });
      });
    });
    makeVerseRefsClickable(el);

    // Copy button
    document.getElementById("gospel-copy").addEventListener("click", () => {
      const text = infoPageToText(el.querySelector(".info-page"));
      copyToClipboard(text).then(() => {
        const btn = document.getElementById("gospel-copy");
        btn.textContent = "✅ Copied!";
        setTimeout(() => { btn.textContent = "📋 Copy"; }, 1500);
      }).catch((e) => {
        console.warn("[KJB] Copy failed:", e);
        const btn = document.getElementById("gospel-copy");
        btn.textContent = "✗ Failed";
        setTimeout(() => { btn.textContent = "📋 Copy"; }, 1500);
      });
    });

    // Print button
    document.getElementById("gospel-print").addEventListener("click", () => {
      printInfoPage(el.querySelector(".info-page"));
    });
  }

  function renderResources() {
    const el = document.getElementById("resources-content");
    if (!el) return;

    setHTML(el, `
      <div class="info-page">
        <div class="info-toolbar">
          <button class="btn-text" id="resources-copy" title="Copy all text">📋 Copy</button>
          <button class="btn-text" id="resources-print" title="Print this page">🖨 Print</button>
        </div>
        <h2>Resources</h2>
        <p class="info-intro">KJB defence materials, studies on modern version corruption, and links to free Bible study resources.</p>
        <blockquote class="info-quote">"Study to shew thyself approved unto God, a workman that needeth not to be ashamed, rightly dividing the word of truth."<br>— 2 Timothy 2:15</blockquote>

        <div class="info-section">
          <h3>KJBI.org — Free Online Bible College</h3>
          <p>King James Bible Institute by Robert Breaker & Robert Potthoff — a free online Bible college for those who want to go deeper in God's Word.</p>
          <p><a href="#" class="info-link" data-url="https://kjbi.org">Visit KJBI.org ↗</a></p>
        </div>

        <div class="info-section">
          <h3>KJB Discord Bot</h3>
          <p>Use the KJB Reader bot in your own Discord account or add it to a server for daily verses and verse search directly in Discord.</p>
          <p><a href="#" class="info-link" data-url="https://kingjamesbiblereader.com/discord">Add to Discord ↗</a></p>
        </div>

        <div class="info-section">
          <h3>KJB Knights — Personal Server</h3>
          <p>A personal Discord server for me and my friends. Feel free to join us for Bible study and fellowship.</p>
          <p><a href="#" class="info-link" data-url="https://discord.gg/368wTn9pFw">Join KJB Knights ↗</a></p>
        </div>

        <div class="info-section">
          <h3>KJB Defence</h3>
          <p>A dedicated collection of resources defending the King James Bible and exposing the corruption of modern versions.</p>
          <p><a href="#" class="info-link" data-url="https://kingjamesbiblereader.com/kjb-defence">Open KJB Defence ↗</a></p>
        </div>

        <div class="info-section">
          <h3>Verified KJB Preachers</h3>
          <div class="preacher-list">
            <div class="preacher"><strong>Robert Breaker</strong> — KJB missionary evangelist<br><a href="#" class="info-link" data-url="https://youtube.com/@thecloudchurch">YouTube</a> · <a href="#" class="info-link" data-url="https://tiktok.com/@robertbreaker">TikTok</a> · <a href="#" class="info-link" data-url="https://thecloudchurch.org">thecloudchurch.org</a></div>
            <div class="preacher"><strong>Robert Potthoff</strong> — Big Red Preacher, KJB soul winner<br><a href="#" class="info-link" data-url="https://instagram.com/robertpotthoff">Instagram</a> · <a href="#" class="info-link" data-url="https://facebook.com/robert.potthoff">Facebook</a></div>
            <div class="preacher"><strong>Ryan Poff</strong> — Seed of Hope Church, KJB pastor<br><a href="#" class="info-link" data-url="https://seedofhopechurch.org">seedofhopechurch.org</a> · <a href="#" class="info-link" data-url="https://youtube.com/@seedofhopechurch">YouTube</a></div>
            <div class="preacher"><strong>Skyler (AV1611 Ministry)</strong> — KJB defence and preaching<br><a href="#" class="info-link" data-url="https://tiktok.com/@av1611ministry">TikTok</a> · <a href="#" class="info-link" data-url="https://youtube.com/@av1611ministry">YouTube</a></div>
            <div class="preacher"><strong>Crown of Thorns</strong> — KJB preaching on YouTube<br><a href="#" class="info-link" data-url="https://youtube.com/@crownofthorns">YouTube</a></div>
            <div class="preacher"><strong>Paul Johnson</strong> — Biblical Salvation, KJB teaching<br><a href="#" class="info-link" data-url="https://tiktok.com/@biblicalsalvation">TikTok</a> · <a href="#" class="info-link" data-url="https://youtube.com/@biblicalsalvation">YouTube</a></div>
            <div class="preacher"><strong>CPR Missions</strong> — Church planting and revival<br><a href="#" class="info-link" data-url="https://youtube.com/@cprmissions">YouTube</a> · <a href="#" class="info-link" data-url="https://tiktok.com/@cprmissions">TikTok</a></div>
            <div class="preacher"><strong>James Bray</strong> — KJB preacher and Bible teacher<br><a href="#" class="info-link" data-url="https://youtube.com/@jamesbray">YouTube</a></div>
          </div>
        </div>

        <div class="info-section">
          <h3>Personal Ministry Links</h3>
          <div class="preacher">
            <a href="#" class="info-link" data-url="https://godisgracious1031ministriescom.odoo.com/"><strong>God is Gracious 1031 Ministries</strong></a><br>
            <a href="#" class="info-link" data-url="https://youtube.com/@shawnr325av">YouTube</a> ·
            <a href="#" class="info-link" data-url="https://rumble.com/@shawnr325av">Rumble</a> ·
            <a href="#" class="info-link" data-url="https://linktr.ee/shawnr325av">Linktree</a>
          </div>
        </div>

        <div class="info-section">
          <h3>Contact</h3>
          <p><a href="mailto:kingjamesbiblereader@outlook.sg" class="info-link">kingjamesbiblereader@outlook.sg</a></p>
        </div>


      </div>
    `);

    el.querySelectorAll(".info-link").forEach(link => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: link.dataset.url });
      });
    });
    makeVerseRefsClickable(el);

    // Copy button
    document.getElementById("resources-copy").addEventListener("click", () => {
      const text = infoPageToText(el.querySelector(".info-page"));
      copyToClipboard(text).then(() => {
        const btn = document.getElementById("resources-copy");
        btn.textContent = "✅ Copied!";
        setTimeout(() => { btn.textContent = "📋 Copy"; }, 1500);
      }).catch((e) => {
        console.warn("[KJB] Copy failed:", e);
        const btn = document.getElementById("resources-copy");
        btn.textContent = "✗ Failed";
        setTimeout(() => { btn.textContent = "📋 Copy"; }, 1500);
      });
    });

    document.getElementById("resources-print").addEventListener("click", () => {
      printInfoPage(el.querySelector(".info-page"));
    });

  }

  // --- Start ---
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { try { init(); } catch(e) { console.error("[KJB] init error:", e); } });
  } else {
    try { init(); } catch(e) { console.error("[KJB] init error:", e); }
  }
})();


// Notify background when the side panel closes so it stops assuming the
// panel is available for direct verse pushes.
function notifyPanelClosed() {
  if (KJB_IS_OVERLAY) return;   // the overlay must never touch panel state
  // Only the real side panel may report the panel closed — a lookup popup
  // closing must not make the background think the panel went away.
  if (KJB_IS_SIDE_PANEL) {
    kjbSend({ type: "KJB_PANEL_CLOSED" });
  }
  try { chrome.storage.local.set({ kjbSidePanelOpen: false }); } catch(e) {}
}
window.addEventListener("pagehide", notifyPanelClosed);
