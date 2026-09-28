// Runs synchronously in <head>, BEFORE #app is parsed or painted.
//
// The flash on first open had two causes:
//   1. loadUiScale() painted at 100%, then applied the saved scale after an
//      async chrome.storage read — a visible jump on every open.
//   2. With a verse in the URL, the default view painted first and was then
//      replaced by results.
// chrome.storage cannot be read synchronously, so the scale is mirrored into
// localStorage (which can) purely for this pre-paint pass. chrome.storage
// remains the source of truth; sidebar.js reconciles immediately after.
(function () {
  try {
    var params = new URLSearchParams(location.search);
    if (params.get("q")) {
      // Suppress the default banner before it can paint.
      document.documentElement.classList.add("kjb-has-lookup");
    }

    // Edge's native side panel frame already renders its own header with the
    // extension's icon, "KJB Reader - SidePanel" title text and a close (X)
    // button — the exact same branding our own in-page header repeats right
    // below it, so the panel visibly says its own name twice. Chrome's side
    // panel chrome is a minimal source dropdown (no title text) and Firefox's
    // sidebar picker only names the extension in its own dropdown, so neither
    // duplicates like this; this is Edge-specific. Only the true docked side
    // panel is affected — the in-page overlay iframe and the popup lookup
    // window embed this same file but have no native title bar of their own.
    // The URL is the ONLY surface test needed: content.js tags the in-page
    // overlay with ?ctx=overlay and the popup lookup window with ?win=1.
    // NEVER add window !== window.top to this test — Edge hosts its docked
    // side panel inside an internal frame, so on Edge the REAL panel IS an
    // iframe, and that test misclassified it as an overlay, leaving the
    // duplicate title under Edge's native header.
    var isOverlay = params.get("ctx") === "overlay";
    var isLookupWindow = /[?&]win=1/.test(location.search);
    var isEdge = /Edg\//i.test(navigator.userAgent) ||
      !!(navigator.userAgentData && (navigator.userAgentData.brands || []).some(
        function (b) { return /Microsoft Edge/i.test(b.brand); }
      ));
    if (isEdge && !isOverlay && !isLookupWindow) {
      document.documentElement.classList.add("kjb-edge-panel");
    }

    var raw = parseFloat(localStorage.getItem("kjbUiScale"));
    var scale = (!raw || raw < 0.75 || raw > 1.5) ? 1 : raw;

    // Short viewports (landscape phones, squat overlays) scroll as one document
    // rather than as a clipped 100vh column. Decided here, before first paint,
    // so the panel never flashes the collapsed layout on the way in. Mirrors
    // SHORT_LAYOUT_PX in sidebar.js.
    if (window.innerHeight / scale < 560) {
      document.documentElement.classList.add("kjb-short-pre");
    }

    if (scale === 1) return;
    raw = scale;

    // Mirror sidebar.js's computeScaleStyles(): CSS zoom with a pixel box sized
    // relative to the scale, so the layout neither clips nor leaves a gap.
    var supportsZoom = !!(window.CSS && CSS.supports && CSS.supports("zoom", "1.5"));

    // Not rounded: computeScaleStyles() in sidebar.js uses the raw quotient, and
    // any difference here would cause a sub-pixel reflow when JS takes over.
    var w = window.innerWidth / raw;
    // Matches scaledHeightCss() in sidebar.js — small-viewport based, so the
    // pre-paint box is not taller than what the browser chrome leaves visible.
    var supportsSvh = !!(window.CSS && CSS.supports && CSS.supports("height", "100svh"));
    var h = window.innerHeight / raw;
    var hCss = supportsSvh ? "calc(100svh / " + raw + ")" : h + "px";
    var isShort = document.documentElement.classList.contains("kjb-short-pre");
    // A short panel takes its height from the content, with the scaled viewport
    // height only as a floor — otherwise the footer is pushed out of the box.
    var heightRule = isShort
      ? "height:auto;min-height:" + hCss + ";"
      : "height:" + hCss + ";";
    var style = document.createElement("style");
    style.id = "kjb-prepaint";
    if (supportsZoom) {
      style.textContent = "#app{zoom:" + raw + ";width:" + w + "px;" + heightRule + "}";
    } else {
      // Engines without CSS zoom (older Gecko) get the transform branch, which
      // must match computeScaleStyles() including clipping the host document —
      // transform leaves the pre-transform box at full size, which would
      // otherwise add scrollbars.
      style.textContent = "#app{transform:scale(" + raw + ");transform-origin:0 0;width:" +
        w + "px;" + heightRule + "}" +
        (isShort ? "html,body{overflow-x:hidden;overflow-y:auto;}" : "html,body{overflow:hidden;}");
    }
    document.head.appendChild(style);
  } catch (e) {}
})();
