// Print page. Opened as a real tab so mobile can use the browser's own
// Print / Save-as-PDF, which is the only route that works on Firefox for
// Android — window.print() is not implemented there, so the old off-screen
// iframe and window.open tiers silently did nothing.
//
// The scripture HTML is handed over through chrome.storage.local instead of a
// blob: URL, because a blob document inherits the extension's MV3 CSP and the
// auto-print <script> the old code appended to it was blocked outright.
(function () {
  "use strict";

  var KEY = "kjbPrintPayload";
  var isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  var bar = document.getElementById("print-bar");
  var hint = document.getElementById("print-hint");
  var content = document.getElementById("print-content");
  var btn = document.getElementById("print-now");

  function tryPrint() {
    try { window.print(); } catch (e) { /* unsupported (Firefox Android) */ }
  }

  btn.addEventListener("click", tryPrint);

  // Shown on mobile only: Firefox for Android cannot open the dialog from
  // script, so the browser's own Print / Share is the route there. On Edge for
  // Android the dialog opens by itself and this is just reassurance.
  hint.textContent = isMobile
    ? "No print dialog? Use your browser menu (\u22ee) \u2192 Print, or Share \u2192 Print."
    : "";

  // Callback form on purpose: Firefox's chrome.* is callback-based, so a
  // promise-style .then() here would throw and leave a blank page.
  chrome.storage.local.get([KEY], function (data) {
    var payload = data && data[KEY];
    if (!payload || !payload.html) {
      content.innerHTML = "";
      var p = document.createElement("p");
      p.style.cssText = "padding:24px;font-family:sans-serif;color:#666";
      p.textContent = "Nothing to print — this page expired. Close it and press Print again.";
      content.appendChild(p);
      return;
    }

    document.title = payload.title || "KJB Reader";

    // Parse, never execute: DOMParser does not run scripts, and we drop any
    // <script> nodes before adopting the markup.
    var doc = new DOMParser().parseFromString(payload.html, "text/html");
    var s = doc.querySelectorAll("script");
    for (var i = 0; i < s.length; i++) s[i].parentNode.removeChild(s[i]);

    // Carry the document's own styling across.
    var styles = doc.querySelectorAll("style, link[rel='stylesheet']");
    for (var j = 0; j < styles.length; j++) {
      if (styles[j].tagName.toLowerCase() === "style") {
        var st = document.createElement("style");
        st.textContent = styles[j].textContent;
        document.head.appendChild(st);
      }
    }

    while (doc.body.firstChild) content.appendChild(doc.body.firstChild);

    // Free the handoff slot so it cannot be reprinted stale later.
    try { chrome.storage.local.remove([KEY], function () {}); } catch (e) {}

    // Always attempt the dialog, on every platform:
    //   * desktop and Chromium-based mobile (Edge for Android, Kiwi) implement
    //     window.print(), so this opens the print/PDF dialog straight away,
    //     which is the "open and print" behaviour asked for;
    //   * Firefox for Android does not implement it at all, where the call is a
    //     harmless no-op and the button plus hint below take over.
    setTimeout(tryPrint, isMobile ? 600 : 350);
  });
})();
