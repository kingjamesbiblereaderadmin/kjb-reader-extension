// KJB Reader - Background Script
// Chrome/Edge: chrome.sidePanel (openPanelOnActionClick) + overlay fallback for PWAs
// Opera: overlay only (no native sidebar)
// Firefox: native browser.sidebarAction only on desktop

const isFirefox = typeof browser !== "undefined" && typeof browser.sidebarAction !== "undefined";
const hasChromeSidePanel = !isFirefox && typeof chrome !== "undefined" && typeof chrome.sidePanel !== "undefined" && !!chrome.sidePanel.setPanelBehavior;
const isOpera = !isFirefox && !hasChromeSidePanel;
const api = isFirefox ? browser : chrome;

// Track which tabs are in PWA/standalone mode (side panel unavailable)
const standaloneTabs = new Set();

// Track the side panel via a long-lived Port connection.
// The sidebar connects on load and auto-reconnects when the SW restarts.
// This gives us a synchronous, real-time check for whether the panel is open.
let sidePanelPort = null;
let sidePanelOpen = false;

function setSidePanelOpen(value) {
  sidePanelOpen = value;
  try { chrome.storage.local.set({ kjbSidePanelOpen: value }); } catch (_) {}
}

// Do NOT restore sidePanelOpen from storage on SW restart.
// The panel may have closed while the SW was asleep, leaving a stale true flag
// that prevents sidePanel.open() from firing on the next verse click.
// Instead, rely on sidePanelPort (reconnects in ~100ms) and the heartbeat
// (hbAge < 6500) to detect a genuinely open panel.

// NOTE: no programmatic re-injection, and deliberately no "scripting"
// permission. MV3 requires host_permissions for scripting.executeScript —
// declaring content_scripts for <all_urls> does NOT grant it — so this
// extension could never have injected into other tabs anyway. Instead of
// asking for broad host access to patch open tabs, each content script now
// stands down on its own once its context is gone (see content.js), and a
// reloaded tab picks up the new version normally.

// Push panel status to all tabs
function broadcastPanelStatus(open) {
  console.log("[KJB Background] Broadcasting panel status:", open);
  api.tabs.query({}, (tabs) => {
    if (!tabs) return;
    for (const tab of tabs) {
      api.tabs.sendMessage(tab.id, { type: "KJB_PANEL_STATUS", open }).catch(() => {});
    }
  });
}

// Listen for sidebar Port connections
api.runtime.onConnect.addListener((port) => {
  console.log("[KJB Background] onConnect:", port.name);
  if (port.name === "kjbSidePanel") {
    sidePanelPort = port;
    setSidePanelOpen(true);
    console.log("[KJB Background] Side panel Port connected — broadcasting to tabs");
    broadcastPanelStatus(true);
    port.onDisconnect.addListener(() => {
      sidePanelPort = null;
      setSidePanelOpen(false);
      broadcastPanelStatus(false);
    });
  }
});

// --- Helper: open lookup via sidePanel or overlay fallback ---
function openLookup(tabId, text) {
  if (isFirefox) {
    // Firefox desktop: native sidebar only. Context-menu and toolbar handlers
    // are direct user gestures, so call open() immediately without an async pre-check.
    try {
      const opened = browser.sidebarAction.open();
      if (opened?.catch) opened.catch(err => console.warn("[KJB Reader] Firefox sidebar did not open:", err));
    } catch (err) {
      console.warn("[KJB Reader] Firefox sidebar unavailable:", err);
    }
    return;
  }
  if (isOpera || !hasChromeSidePanel) {
    openFallbackSurface(text, tabId, standaloneTabs.has(tabId));
    return;
  }
  // Store verse for pull model — side panel requests it when ready
  if (text) {
    pendingVerse = text;
    pendingVerseTs = Date.now();
    // Also push to side panel (works if panel is already open)
    api.runtime.sendMessage({ type: "KJB_SIDEBAR_LOOKUP", text, ts: pendingVerseTs }).catch(() => {});
  }
  // Chrome/Edge: if tab is in PWA/standalone mode, skip sidePanel entirely
  if (standaloneTabs.has(tabId)) {
    openFallbackSurface(text, tabId, true);
    return;
  }
  // If the side panel is already open, the KJB_SIDEBAR_LOOKUP message above
  // will deliver the verse. Skip sidePanel.open() — it can reject on some
  // sites even when the panel is visible, which would trigger the overlay.
  if (sidePanelPort || (Date.now() - lastPanelAliveTs < 6500)) return;
  // Try sidePanel first, fall back to overlay on failure.
  // IMPORTANT: sidePanel.open() rejects on some sites even when the panel is
  // already visible. Before falling back to an overlay, check the panel's
  // storage heartbeat — otherwise we inject an overlay over a working panel
  // and it gets removed a moment later (the "flash").
  chrome.sidePanel.open({ tabId }).then(() => {
    setSidePanelOpen(true);
  }).catch(() => {
    if (!tabId) return;
    chrome.storage.local.get(["kjbPanelHeartbeat"], (d) => {
      const hb = (d && d.kjbPanelHeartbeat) || 0;
      if (Date.now() - hb < 6500) {
        console.log("[KJB Background] sidePanel.open rejected but panel is live — no fallback");
        return;
      }
      openFallbackSurface(text, tabId);
    });
  });
}

// --- Platform-adaptive extension action ---
// Edge for Android has no usable desktop side panel. Register the complete
// KJB Reader interface as the extension-action popup so Menu > Extensions >
// KJB Reader opens it directly without requiring a verse click.
function configurePlatformAction() {
  if (isFirefox) return;
  api.runtime.getPlatformInfo().then((info) => {
    const isAndroid = info && info.os === "android";
    const actionApi = chrome.action || chrome.browserAction;
    if (actionApi && typeof actionApi.setPopup === "function") {
      const popupResult = actionApi.setPopup({ popup: isAndroid ? "sidebar.html" : "" });
      return Promise.resolve(popupResult).then(() => {
        if (hasChromeSidePanel) {
          return chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: !isAndroid });
        }
      });
    }
  }).catch((err) => {
    console.warn("[KJB Reader] Could not configure platform action:", err);
  });
}

configurePlatformAction();
api.runtime.onStartup.addListener(configurePlatformAction);

// --- Context Menu Setup ---
api.runtime.onInstalled.addListener(() => {
  api.contextMenus.create({
    id: "kjb-lookup-selection",
    title: "Look up verse: \"%s\"",
    contexts: ["selection"]
  });
  api.contextMenus.create({
    id: "kjb-lookup-page",
    title: "Search KJB Reader",
    contexts: ["page"]
  });

  configurePlatformAction();

  api.runtime.setUninstallURL("mailto:kingjamesbiblereader@outlook.sg?subject=KJB%20Reader%20Extension%20Feedback&body=Hi%2C%20I%20uninstalled%20the%20KJB%20Reader%20extension%20because...");
});

// --- Toolbar click ---
if (isFirefox) {
  api.action.onClicked.addListener((tab) => {
    try { browser.sidebarAction.open(); } catch (e) {}
  });
} else if (isOpera) {
  // Opera: toolbar click injects overlay in the active tab
  const actionApi = chrome.browserAction || chrome.action;
  if (actionApi && actionApi.onClicked) {
    actionApi.onClicked.addListener((tab) => {
      // Through the arbiter like every other surface request.
      openFallbackSurface(null, tab.id, false);
    });
  }
} else if (hasChromeSidePanel) {
  // Chrome/Edge: openPanelOnActionClick opens the side panel for normal
  // tabs. onClicked fires only when the side panel can't open (e.g. PWA
  // windows). For those, try sidePanel.open in case it's a transient
  // failure — if it rejects, mark the tab standalone and inject the overlay.
  chrome.action.onClicked.addListener((tab) => {
    if (standaloneTabs.has(tab.id)) {
      openFallbackSurface(null, tab.id, true);
      return;
    }
    // Side panel couldn't open (onClicked wouldn't fire if it could).
    // Try once more in case it's recoverable; otherwise fall back to overlay.
    chrome.sidePanel.open({ tabId: tab.id }).then(() => {
      setSidePanelOpen(true);
    }).catch(() => {
      standaloneTabs.add(tab.id);
      openFallbackSurface(null, tab.id, true);
    });
  });
}

// --- Context Menu Handler ---
api.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "kjb-lookup-selection") {
    const text = info.selectionText?.trim() || "";
    api.storage.local.set({ pendingLookup: text, lookupTimestamp: Date.now() });
    if (tab?.id) openLookup(tab.id, text);
  } else if (info.menuItemId === "kjb-lookup-page") {
    const lookup = rightClickedVerse || "";
    rightClickedVerse = null;
    api.storage.local.set({ pendingLookup: lookup, lookupTimestamp: Date.now() });
    if (tab?.id) openLookup(tab.id, lookup);
  }
});

let rightClickedVerse = null;

// --- Message Router ---
// Last time the real side panel proved it was alive.
let lastPanelAliveTs = 0;
let lastLookupText = null;
let lastLookupTs = 0;
// The popup window we opened as a fallback, so clicks reuse it.
let lookupWindowId = null;

// Chosen only AFTER the side panel has failed to acknowledge a lookup.
// Chrome/Edge get a popup window — a separate window cannot flash over the
// page. Browsers with no side panel keep the in-page overlay, forced past the
// content script's guard because there is no panel to conflict with.
// Guarantees a single surface per lookup. Whichever path asks first wins; any
// other path asking within the window is refused. This is belt-and-braces on
// top of the routing fixes, because "overlay AND popup window" must be
// impossible even if some path I have not found asks for one.
let surfaceClaimTs = 0;
let surfaceClaimKind = null;
function claimSurface(kind) {
  const now = Date.now();
  // One surface per lookup — including a repeat of the SAME kind. Two paths
  // racing on one click could otherwise open two popup windows.
  if (surfaceClaimKind && now - surfaceClaimTs < 1200) {
    console.log("[KJB Background] surface '" + surfaceClaimKind + "' already claimed " +
      (now - surfaceClaimTs) + "ms ago — refusing '" + kind + "'");
    return false;
  }
  surfaceClaimKind = kind;
  surfaceClaimTs = now;
  return true;
}

function openFallbackSurface(text, tabId, standaloneHint) {
  // The hint matters: a restarted service worker loses standaloneTabs, and
  // without it a PWA/mobile tab would wrongly get a popup window.
  if (tabId !== null && (standaloneHint || standaloneTabs.has(tabId))) {
    if (!claimSurface("overlay")) return;
    // Never leave a popup window from an earlier lookup sitting alongside the
    // overlay — that pairing is exactly what the user was seeing.
    if (lookupWindowId !== null) {
      const stale = lookupWindowId;
      lookupWindowId = null;
      chrome.windows.remove(stale).catch(() => {});
    }
    console.log("[KJB Background] no panel answered — overlay (standalone tab)");
    api.tabs.sendMessage(tabId, { type: "KJB_INJECT_OVERLAY", text: text || null, force: true, reason: "standalone" }, { frameId: 0 }).catch(() => {});
    return;
  }
  if (isOpera || !hasChromeSidePanel) {
    if (!claimSurface("overlay")) return;
    if (tabId) {
      api.tabs.sendMessage(tabId, { type: "KJB_INJECT_OVERLAY", text: text || null, force: true, reason: "no-side-panel" }, { frameId: 0 }).catch(() => {});
    }
    return;
  }
  if (!claimSurface("window")) return;
  // A popup window and an in-page overlay must never share a lookup.
  if (tabId) {
    api.tabs.sendMessage(tabId, { type: "KJB_REMOVE_OVERLAY" }, { frameId: 0 }).catch(() => {});
  }
  // Carry the verse in the URL. Messaging into a window that is still being
  // created is a race the window usually loses — which is why a lookup could
  // land in an empty window. A query parameter cannot arrive too early.
  const params = new URLSearchParams({ win: "1" });
  if (text) { params.set("q", text); params.set("ts", String(Date.now())); }
  const lookupUrl = chrome.runtime.getURL("sidebar.html?" + params.toString());

  if (lookupWindowId !== null) {
    // Reuse by NAVIGATION, not by messaging: the reused window then loads the
    // verse from its own URL, exactly like a freshly created one. The old
    // message-based reuse had the same race as a brand-new window.
    chrome.tabs.query({ windowId: lookupWindowId }).then((tabs) => {
      if (!tabs || !tabs.length) throw new Error("lookup window has no tab");
      return chrome.tabs.update(tabs[0].id, { url: lookupUrl }).then(() => {
        chrome.windows.update(lookupWindowId, { focused: true }).catch(() => {});
      });
    }).catch(() => {
      lookupWindowId = null;
      // Keep the hint: dropping it here previously let a standalone tab fall
      // through to a popup window.
      openFallbackSurface(text, tabId, standaloneHint);
    });
    return;
  }
  console.log("[KJB Background] no panel answered — opening lookup window");
  chrome.windows.create({
    url: lookupUrl,
    type: "popup",
    width: 460,
    height: 760
  }).then((win) => {
    if (win) lookupWindowId = win.id;
  }).catch((err) => {
    console.warn("[KJB Background] lookup window failed:", err);
    if (tabId) {
      api.tabs.sendMessage(tabId, { type: "KJB_INJECT_OVERLAY", text: text || null, force: true, reason: "window-failed" }, { frameId: 0 }).catch(() => {});
    }
  });
}

try {
  chrome.windows.onRemoved.addListener((id) => {
    if (id === lookupWindowId) lookupWindowId = null;
  });
} catch (e) {}

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Track PWA/standalone mode per tab
  if (msg.type === "KJB_STANDALONE_MODE" && sender.tab?.id) {
    if (msg.isStandalone) {
      standaloneTabs.add(sender.tab.id);
    } else {
      standaloneTabs.delete(sender.tab.id);
    }
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === "KJB_GET_CAPS") {
    // The page cannot tell Chrome from Opera (chrome.sidePanel is not exposed to
    // content scripts), so the background tells it. Used to refuse overlays on
    // browsers that have a real side panel.
    sendResponse({ hasSidePanel: hasChromeSidePanel, isOpera: isOpera, isFirefox: isFirefox });
    return;
  }

  if (msg.type === "KJB_OPEN_PRINT_PAGE") {
    // Some mobile popup contexts refuse tabs.create; the background can always do it.
    api.tabs.create({ url: msg.url }).catch(() => {});
    return;
  }

  if (msg.type === "KJB_OPEN_LOOKUP") {
    console.log("[KJB Background] KJB_OPEN_LOOKUP received:", msg.text);
    // Two listeners racing on one click would otherwise schedule two
    // fallbacks, and two fallbacks can mean two surfaces.
    if (msg.text && msg.text === lastLookupText && Date.now() - lastLookupTs < 500) {
      console.log("[KJB Background] duplicate lookup ignored");
      sendResponse({ ok: true, duplicate: true, hasSidePanel: hasChromeSidePanel });
      return;
    }
    lastLookupText = msg.text || null;
    lastLookupTs = Date.now();
    if (sender && sender.tab && typeof msg.standalone === "boolean") {
      if (msg.standalone) standaloneTabs.add(sender.tab.id);
      else standaloneTabs.delete(sender.tab.id);
    }
    // Store verse for pull model — side panel will request it when ready
    if (msg.text) {
      pendingVerse = msg.text;
      pendingVerseTs = Date.now();
    }
    // Always forward the verse to the sidebar (if it's listening)
    api.runtime.sendMessage({ type: "KJB_SIDEBAR_LOOKUP", text: msg.text, ts: pendingVerseTs }).catch(() => {});
    // Also forward via Port if connected
    if (sidePanelPort) {
      sidePanelPort.postMessage({ type: "KJB_SIDEBAR_LOOKUP", text: msg.text, ts: pendingVerseTs });
    }
    // The page no longer guesses whether the panel is open — we settle it here
    // with an acknowledgement. A live panel answers KJB_PANEL_ALIVE within a
    // few milliseconds (message delivery is never throttled, unlike timers).
    // If nothing answers, THEN we pick a fallback surface. Because that choice
    // happens after the fact, no surface is ever created and withdrawn.
    const askedAt = Date.now();
    const tabId = sender && sender.tab ? sender.tab.id : null;

    // Try the REAL side panel first — a popup window should only ever be the
    // consolation prize. This call must happen synchronously here, inside the
    // message handler: Chrome only honours sidePanel.open() while the user
    // gesture from the click is still in scope, and any await discards it.
    // If the side panel is already open, skip sidePanel.open() — calling it
    // on an already-open panel causes Chrome to close and reopen it (flash).
    const hbAge = Date.now() - lastPanelAliveTs;
    // Don't trust sidePanelOpen alone — it can be stale after SW restart.
    // Require a live signal: port connection OR recent heartbeat.
    const panelAlreadyOpen = sidePanelPort || (hbAge < 6500);

    if (panelAlreadyOpen) {
      console.log("[KJB Background] side panel already open — skipping sidePanel.open");
      sendResponse({ ok: true, hasSidePanel: hasChromeSidePanel });
      return;
    }

    // Standalone/PWA tabs have no side panel — go straight to overlay.
    if (standaloneTabs.has(tabId) || msg.standalone === true) {
      console.log("[KJB Background] standalone tab — overlay immediately");
      openFallbackSurface(msg.text, tabId, true);
      sendResponse({ ok: true, hasSidePanel: hasChromeSidePanel });
      return;
    }

    if (!hasChromeSidePanel || isOpera) {
      openFallbackSurface(msg.text, tabId, false);
      sendResponse({ ok: true, hasSidePanel: hasChromeSidePanel });
      return;
    }

    // Promise-based: no timer racing the side panel's own opening animation.
    // The fallback only fires if sidePanel.open() actually rejects. This
    // eliminates the "page captured" effect caused by a popup window
    // appearing while the side panel was still animating in.
    let settled = false;
    try {
      chrome.sidePanel.open({ tabId }).then(() => {
        settled = true;
        setSidePanelOpen(true);
        console.log("[KJB Background] side panel opened — no fallback needed");
        api.runtime.sendMessage({ type: "KJB_SIDEBAR_LOOKUP", text: msg.text, ts: pendingVerseTs }).catch(() => {});
        // Retry delivery after a short delay — the sidebar may not have
        // registered its message listener yet when the first send fires.
        // The sidebar deduplicates by timestamp, so a duplicate delivery
        // is harmless.
        const retryText = msg.text, retryTs = pendingVerseTs;
        setTimeout(() => {
          api.runtime.sendMessage({ type: "KJB_SIDEBAR_LOOKUP", text: retryText, ts: retryTs }).catch(() => {});
          if (sidePanelPort) {
            sidePanelPort.postMessage({ type: "KJB_SIDEBAR_LOOKUP", text: retryText, ts: retryTs });
          }
        }, 300);
        // Check if this is a PWA window where the panel isn't visible.
        if (sender?.tab?.windowId) {
          chrome.windows.get(sender.tab.windowId).then((win) => {
            if (win.type === "popup" || win.type === "app") {
              console.log("[KJB Background] PWA window — panel not visible, overlay");
              standaloneTabs.add(tabId);
              openFallbackSurface(msg.text, tabId, true);
            }
          }).catch(() => {});
        }
      }).catch((err) => {
        settled = true;
        console.log("[KJB Background] sidePanel.open refused (" +
          ((err && err.message) || "no gesture") + ") — fallback");
        standaloneTabs.add(tabId);
        openFallbackSurface(msg.text, tabId, true);
      });
    } catch (err) {
      settled = true;
      console.log("[KJB Background] sidePanel.open threw:", err && err.message);
      openFallbackSurface(msg.text, tabId, false);
    }

    // Watchdog: if the promise somehow never settles (Chrome bug), fall
    // back after 5s. This should never fire in practice.
    setTimeout(() => {
      if (!settled) {
        console.log("[KJB Background] sidePanel.open watchdog — no settle in 5s, fallback");
        openFallbackSurface(msg.text, tabId, false);
      }
    }, 5000);

    sendResponse({ ok: true, hasSidePanel: hasChromeSidePanel });
  }

  if (msg.type === "KJB_PANEL_OPENED") {
    setSidePanelOpen(true);
    sidePanelOpen = true;
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === "KJB_PANEL_CLOSED") {
    setSidePanelOpen(false);
    sidePanelOpen = false;
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === "KJB_SELECTION") {
    api.contextMenus.update("kjb-lookup-selection", {
      title: msg.isVerse ? `Look up verse: \"%s\"` : `Search KJB Reader for: \"%s\"`
    }).catch?.(() => {});
  }

  if (msg.type === "KJB_RIGHTCLICK_VERSE") {
    rightClickedVerse = msg.text;
    api.contextMenus.update("kjb-lookup-page", {
      title: msg.text ? `Look up: ${msg.text}` : "Search KJB Reader"
    }).catch?.(() => {});
  }

  if (msg.type === "KJB_PANEL_ALIVE") {
    lastPanelAliveTs = Date.now();
    // The side panel itself reported in. Trust this above everything else:
    // mark it open and tell every tab to drop any overlay it injected.
    setSidePanelOpen(true);
    sidePanelOpen = true;
    broadcastPanelStatus(true);
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === "KJB_CHECK_PANEL") {
    // Content script asking if the side panel is open (on load).
    // Use getContexts if available, else fall back to Port.
    if (typeof chrome.runtime.getContexts === "function") {
      chrome.runtime.getContexts({ contextTypes: ["SIDE_PANEL"] }).then((contexts) => {
        const open = !!(contexts && contexts.length > 0);
        console.log("[KJB Background] KJB_CHECK_PANEL via getContexts:", open);
        sendResponse({ open });
      }).catch(() => {
        sendResponse({ open: !!sidePanelPort });
      });
      return true;
    }
    console.log("[KJB Background] KJB_CHECK_PANEL via Port:", !!sidePanelPort);
    sendResponse({ open: !!sidePanelPort });
    return;
  }

  if (msg.type === "KJB_ACK_LOOKUP") {
    // The panel delivered this exact verse already. Clear it only if the
    // timestamps match, so a newer verse that arrived meanwhile survives.
    if (msg.ts && msg.ts === pendingVerseTs) {
      pendingVerse = null;
      pendingVerseTs = 0;
      console.log("[KJB Background] pending verse acked and cleared");
    }
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === "KJB_GET_PENDING") {
    // Side panel is asking for the pending verse (pull model)
    const verse = pendingVerse;
    const ts = pendingVerseTs;
    pendingVerse = null;  // Clear after sending
    pendingVerseTs = 0;
    sendResponse({ verse, ts });
    return;
  }

  if (msg.type === "KJB_API_REQUEST") {
    fetch(msg.url, msg.options)
      .then(r => r.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

// sidePanelOpen is tracked only via live signals (port, KJB_PANEL_ALIVE).
// Do not sync from storage — stale values after SW restart caused the panel
// to never open because the background thought it was already open.

// Clean up standalone tracking when tabs close
api.tabs.onRemoved.addListener((tabId) => {
  standaloneTabs.delete(tabId);
});
