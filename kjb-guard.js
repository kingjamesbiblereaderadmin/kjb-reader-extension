/*
 * kjb-guard.js — keeps the KJB Reader content script out of text boxes and editors.
 * Load it BEFORE content.js, in the same content_scripts "js" array (same isolated world).
 * Do NOT include it in sidebar.html.
 *
 * It only wraps things the content script itself uses (its own event listeners,
 * MutationObserver and TreeWalker). It does not touch the page's own scripts.
 */
(() => {
  if (window.__kjbGuardInstalled) return;
  window.__kjbGuardInstalled = true;

  const EDITABLE_SEL = [
    'input', 'textarea', 'select',
    '[contenteditable=""]', '[contenteditable="true"]', '[contenteditable="plaintext-only"]',
    '[role="textbox"]', '[role="combobox"]', '[role="searchbox"]',
    '[data-lexical-editor]', '[data-slate-editor]',
    '.DraftEditor-root', '.public-DraftEditor-content',
    '.ProseMirror', '.ql-editor', '.CodeMirror', '.cm-editor', '.monaco-editor'
  ].join(',');

  function isEditable(n) {
    try {
      if (!n) return false;
      const el = n.nodeType === 1 ? n : n.parentElement;
      if (!el) return false;
      if (el.isContentEditable) return true;
      return !!el.closest(EDITABLE_SEL);
    } catch (_) {
      return false;
    }
  }
  window.__kjbIsEditable = isEditable; // usable from content.js too




  /* 1. Skip the content script's own handlers when the event comes from an editable field */
  const GUARDED = new Set([
    'click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup',
    'touchstart', 'touchend', 'contextmenu',
    'keydown', 'keyup', 'keypress', 'beforeinput', 'input', 'focusin', 'selectionchange'
  ]);
  const wrapped = new WeakMap();

  function shouldSkip(ev) {
    const t = (ev.composedPath && ev.composedPath()[0]) || ev.target;
    if (isEditable(t)) {
      return true;
    }
    if (ev.type === 'selectionchange') {
      if (isEditable(document.activeElement)) return true;
      const s = window.getSelection && window.getSelection();
      if (s && isEditable(s.anchorNode)) return true;
    }
    return false;
  }

  const origAdd = EventTarget.prototype.addEventListener;
  const origRemove = EventTarget.prototype.removeEventListener;

  EventTarget.prototype.addEventListener = function (type, listener, opts) {
    if (GUARDED.has(type) && typeof listener === 'function') {
      let w = wrapped.get(listener);
      if (!w) {
        w = function (ev) {
          if (shouldSkip(ev)) return;
          return listener.call(this, ev);
        };
        wrapped.set(listener, w);
      }
      return origAdd.call(this, type, w, opts);
    }
    return origAdd.call(this, type, listener, opts);
  };

  EventTarget.prototype.removeEventListener = function (type, listener, opts) {
    const w = typeof listener === 'function' ? wrapped.get(listener) : null;
    return origRemove.call(this, type, w || listener, opts);
  };

  /* 2. MutationObserver: ignore edits inside editors, and wait while the user is typing */
  const NativeMO = window.MutationObserver;
  window.MutationObserver = class extends NativeMO {
    constructor(cb) {
      super(function (records, obs) {
        const kept = records.filter((r) => !isEditable(r.target));
        if (!kept.length) return;
        if (isEditable(document.activeElement)) {
          setTimeout(() => {
            if (!isEditable(document.activeElement)) cb.call(this, kept, obs);
          }, 1500);
          return;
        }
        cb.call(this, kept, obs);
      });
    }
  };

  /* 3. TreeWalker / NodeIterator: never hand back text nodes inside editable areas */
  function wrapFilter(filter) {
    const user = filter
      ? (typeof filter === 'function' ? filter : filter.acceptNode && filter.acceptNode.bind(filter))
      : null;
    return {
      acceptNode(node) {
        if (isEditable(node)) return NodeFilter.FILTER_REJECT;
        return user ? user(node) : NodeFilter.FILTER_ACCEPT;
      }
    };
  }
  const origTW = Document.prototype.createTreeWalker;
  Document.prototype.createTreeWalker = function (root, what, filter) {
    return origTW.call(this, root, what, wrapFilter(filter));
  };
  const origNI = Document.prototype.createNodeIterator;
  Document.prototype.createNodeIterator = function (root, what, filter) {
    return origNI.call(this, root, what, wrapFilter(filter));
  };
})();
