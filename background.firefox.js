// KJB Reader - Firefox Background Script
// Firefox desktop uses the native browser.sidebarAction API.
// Webpage verse clicks use the in-page overlay because Firefox does not permit
// opening its native sidebar from a content-script message.

const api = browser;
const toolbarAction = api.action || api.browserAction;
let isAndroid = false;
let pendingVerse = null;
let pendingVerseTs = 0;
let rightClickedVerse = null;

function pushPendingLookup(text) {
  if (!text) return;
  pendingVerse = text;
  pendingVerseTs = Date.now();
  // Refresh an already-open native sidebar immediately. A newly opened sidebar
  // will retrieve the same lookup through KJB_GET_PENDING.
  api.runtime.sendMessage({
    type: "KJB_SIDEBAR_LOOKUP",
    text,
    ts: pendingVerseTs,
  }).catch(() => {});
}

function openExtensionUi() {
  // Firefox Android has no sidebarAction API. Its browser-action popup opens as
  // a full browser overlay, while desktop Firefox retains the native sidebar.
  if (!isAndroid && api.sidebarAction && typeof api.sidebarAction.open === "function") {
    try {
      const opened = api.sidebarAction.open();
      if (opened && typeof opened.catch === "function") {
        opened.catch(err => console.warn("[KJB Reader] Firefox sidebar did not open:", err));
      }
      return;
    } catch (err) {
      console.warn("[KJB Reader] Firefox sidebar unavailable:", err);
    }
  }

  // Safe fallback if the action fires before Android popup registration.
  api.tabs.create({ url: api.runtime.getURL("sidebar.html") }).catch(() => {});
}

function configurePlatformUi() {
  api.runtime.getPlatformInfo().then((info) => {
    isAndroid = info && info.os === "android";
    return toolbarAction.setPopup({ popup: isAndroid ? "sidebar.html" : "" });
  }).catch((err) => {
    console.warn("[KJB Reader] Could not configure platform UI:", err);
  });
}

configurePlatformUi();
api.runtime.onStartup.addListener(configurePlatformUi);

api.runtime.onInstalled.addListener(() => {
  // Context menus are desktop-only in Firefox. Android exposes the extension
  // through Browser menu > Add-ons instead.
  if (api.contextMenus && typeof api.contextMenus.create === "function") {
    api.contextMenus.create({
      id: "kjb-lookup-selection",
      title: "Look up verse: \"%s\"",
      contexts: ["selection"],
    });
    api.contextMenus.create({
      id: "kjb-lookup-page",
      title: "Search KJB Reader",
      contexts: ["page"],
    });
  }

  api.runtime.setUninstallURL(
    "mailto:kingjamesbiblereader@outlook.sg?subject=KJB%20Reader%20Extension%20Feedback&body=Hi%2C%20I%20uninstalled%20the%20KJB%20Reader%20extension%20because..."
  );
});

// Toolbar clicks are direct user gestures, so Firefox permits opening its
// native sidebar here.
toolbarAction.onClicked.addListener(() => {
  openExtensionUi();
});

if (api.contextMenus && api.contextMenus.onClicked) api.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "kjb-lookup-selection") {
    const text = info.selectionText?.trim() || "";
    pushPendingLookup(text);
    api.storage.local.set({ pendingLookup: text, lookupTimestamp: Date.now() });
    openExtensionUi();
  } else if (info.menuItemId === "kjb-lookup-page") {
    const text = rightClickedVerse || "";
    rightClickedVerse = null;
    pushPendingLookup(text);
    api.storage.local.set({ pendingLookup: text, lookupTimestamp: Date.now() });
    openExtensionUi();
  }
});

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "KJB_STANDALONE_MODE") {
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === "KJB_OPEN_PRINT_PAGE") {
    // Some mobile popup contexts refuse tabs.create; the background can always do it.
    api.tabs.create({ url: msg.url }).catch(() => {});
    return;
  }

  if (msg.type === "KJB_OPEN_LOOKUP") {
    pushPendingLookup(msg.text);

    // Firefox cannot open the native sidebar from a webpage click. Use the
    // reliable in-page overlay, while retaining the pending lookup so an
    // already-open native sidebar also refreshes.
    if (sender.tab?.id) {
      api.tabs.sendMessage(
        sender.tab.id,
        { type: "KJB_INJECT_OVERLAY", text: msg.text || null },
        { frameId: 0 }
      ).catch(() => {});
    }

    sendResponse({ ok: true });
    return;
  }

  if (msg.type === "KJB_SELECTION") {
    api.contextMenus.update("kjb-lookup-selection", {
      title: msg.isVerse ? "Look up verse: \"%s\"" : "Search KJB Reader for: \"%s\"",
    }).catch(() => {});
    return;
  }

  if (msg.type === "KJB_RIGHTCLICK_VERSE") {
    rightClickedVerse = msg.text;
    api.contextMenus.update("kjb-lookup-page", {
      title: msg.text ? `Look up: ${msg.text}` : "Search KJB Reader",
    }).catch(() => {});
    return;
  }

  if (msg.type === "KJB_GET_PENDING") {
    const verse = pendingVerse;
    const ts = pendingVerseTs;
    pendingVerse = null;
    pendingVerseTs = 0;
    sendResponse({ verse, ts });
    return;
  }

  if (msg.type === "KJB_API_REQUEST") {
    fetch(msg.url, msg.options)
      .then(response => response.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});
