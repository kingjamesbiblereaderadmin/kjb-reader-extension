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
