// KJB Reader Sidebar - API Module
// Handles all communication with the KJB Reader backend.

const KJB_API = (() => {
  const DEFAULT_API_BASE = "https://base44.app/api/apps/6a713d810d97fdb5921ed14e";
  const LEGACY_API_BASES = new Set([
    "https://base44.app/api/apps/6a8011c360ff52dad38eb2f3",
    "https://base44.app/api/apps/6a05d76723afe58d80c589e8",
  ]);
  let API_BASE = DEFAULT_API_BASE;
  const FUNCTION = "bibleApi";
  const KJB_WEBSITE = "https://kingjamesbiblereader.com";

  // Copies of a Base44 app receive a new app ID. Migrate existing extension
  // installs that cached the now-deleted original app's API endpoint.
  chrome.storage?.local.get(["kjb_api_base"], (result) => {
    const savedBase = String(result.kjb_api_base || "").replace(/\/+$/, "");
    if (savedBase && !LEGACY_API_BASES.has(savedBase)) {
      API_BASE = savedBase;
      return;
    }
    API_BASE = DEFAULT_API_BASE;
    if (savedBase) chrome.storage?.local.set({ kjb_api_base: DEFAULT_API_BASE });
  });

  function setBaseUrl(url) {
    API_BASE = url;
    chrome.storage?.local.set({ kjb_api_base: url });
  }

  function getBaseUrl() {
    return API_BASE;
  }

  function getWebsiteUrl() {
    return KJB_WEBSITE;
  }

  async function callApi(body) {
    const url = `${API_BASE}/functions/${FUNCTION}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => null);
    // A missing verse is an expected lookup result, not a transport failure.
    // Return its structured 404 payload directly so the UI can say precisely
    // which verse was not found without issuing a duplicate proxy request.
    if (resp.status === 404 && data?.error) return data;
    if (!resp.ok) throw new Error(`API error: ${resp.status} ${resp.statusText}`);
    return data;
  }

  // Marks failures that mean "could not complete the request", as opposed to a
  // valid answer of "that verse does not exist". Conflating the two is what made
  // a cold-start failure display "verse not found".
  function transportError(message) {
    const err = new Error(message);
    err.kjbTransport = true;
    return err;
  }

  function callApiViaBg(body) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "KJB_API_REQUEST",
          url: `${API_BASE}/functions/${FUNCTION}`,
          options: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(transportError(chrome.runtime.lastError.message));
          } else if (response?.ok && response.data != null) {
            resolve(response.data);
          } else if (response?.ok) {
            // Reached the background but it produced no payload — commonly a
            // service worker that was still starting. That is a transport
            // failure, NOT a missing verse, and must not be reported as one.
            reject(transportError("no data returned by the background proxy"));
          } else {
            reject(transportError(response?.error || "API request failed"));
          }
        }
      );
    });
  }

  async function apiCall(body) {
    // The extension bundles the full PCE Bible text (kjb-local.js + kjb-pce.txt),
    // so lookups and searches are served locally — instantly and offline. The
    // remote API is only a fallback if the local engine fails.
    if (typeof KJB_LOCAL !== "undefined" && KJB_LOCAL.isAvailable()) {
      try {
        return await KJB_LOCAL.apiCall(body);
      } catch (e) {
        console.warn("Local PCE engine failed, using remote API:", e?.message || e);
      }
    }
    try {
      const direct = await callApi(body);
      if (direct == null) throw transportError("empty response");
      return direct;
    } catch (e) {
      console.warn("Direct API call failed, trying proxy:", e.message);
      const viaBg = await callApiViaBg(body);   // rejects with kjbTransport
      if (viaBg == null) throw transportError("empty proxy response");
      return viaBg;
    }
  }

  // --- Bible Book metadata ---
  const BOOKS = [
    { name: "Genesis", abbr: "Gen", testament: "old", chapters: 50 },
    { name: "Exodus", abbr: "Exod", testament: "old", chapters: 40 },
    { name: "Leviticus", abbr: "Lev", testament: "old", chapters: 27 },
    { name: "Numbers", abbr: "Num", testament: "old", chapters: 36 },
    { name: "Deuteronomy", abbr: "Deut", testament: "old", chapters: 34 },
    { name: "Joshua", abbr: "Josh", testament: "old", chapters: 24 },
    { name: "Judges", abbr: "Judg", testament: "old", chapters: 21 },
    { name: "Ruth", abbr: "Ruth", testament: "old", chapters: 4 },
    { name: "1 Samuel", abbr: "1Sam", testament: "old", chapters: 31 },
    { name: "2 Samuel", abbr: "2Sam", testament: "old", chapters: 24 },
    { name: "1 Kings", abbr: "1Kgs", testament: "old", chapters: 22 },
    { name: "2 Kings", abbr: "2Kgs", testament: "old", chapters: 25 },
    { name: "1 Chronicles", abbr: "1Chr", testament: "old", chapters: 29 },
    { name: "2 Chronicles", abbr: "2Chr", testament: "old", chapters: 36 },
    { name: "Ezra", abbr: "Ezra", testament: "old", chapters: 10 },
    { name: "Nehemiah", abbr: "Neh", testament: "old", chapters: 13 },
    { name: "Esther", abbr: "Esth", testament: "old", chapters: 10 },
    { name: "Job", abbr: "Job", testament: "old", chapters: 42 },
    { name: "Psalms", abbr: "Ps", testament: "old", chapters: 150 },
    { name: "Proverbs", abbr: "Prov", testament: "old", chapters: 31 },
    { name: "Ecclesiastes", abbr: "Eccl", testament: "old", chapters: 12 },
    { name: "Song of Solomon", abbr: "Song", testament: "old", chapters: 8 },
    { name: "Isaiah", abbr: "Isa", testament: "old", chapters: 66 },
    { name: "Jeremiah", abbr: "Jer", testament: "old", chapters: 52 },
    { name: "Lamentations", abbr: "Lam", testament: "old", chapters: 5 },
    { name: "Ezekiel", abbr: "Ezek", testament: "old", chapters: 48 },
    { name: "Daniel", abbr: "Dan", testament: "old", chapters: 12 },
    { name: "Hosea", abbr: "Hos", testament: "old", chapters: 14 },
    { name: "Joel", abbr: "Joel", testament: "old", chapters: 3 },
    { name: "Amos", abbr: "Amos", testament: "old", chapters: 9 },
    { name: "Obadiah", abbr: "Obad", testament: "old", chapters: 1 },
    { name: "Jonah", abbr: "Jon", testament: "old", chapters: 4 },
    { name: "Micah", abbr: "Mic", testament: "old", chapters: 7 },
    { name: "Nahum", abbr: "Nah", testament: "old", chapters: 3 },
    { name: "Habakkuk", abbr: "Hab", testament: "old", chapters: 3 },
    { name: "Zephaniah", abbr: "Zeph", testament: "old", chapters: 3 },
    { name: "Haggai", abbr: "Hag", testament: "old", chapters: 2 },
    { name: "Zechariah", abbr: "Zech", testament: "old", chapters: 14 },
    { name: "Malachi", abbr: "Mal", testament: "old", chapters: 4 },
    { name: "Matthew", abbr: "Matt", testament: "new", chapters: 28 },
    { name: "Mark", abbr: "Mk", testament: "new", chapters: 16 },
    { name: "Luke", abbr: "Lk", testament: "new", chapters: 24 },
    { name: "John", abbr: "Jn", testament: "new", chapters: 21 },
    { name: "Acts", abbr: "Acts", testament: "new", chapters: 28 },
    { name: "Romans", abbr: "Rom", testament: "new", chapters: 16 },
    { name: "1 Corinthians", abbr: "1Cor", testament: "new", chapters: 16 },
    { name: "2 Corinthians", abbr: "2Cor", testament: "new", chapters: 13 },
    { name: "Galatians", abbr: "Gal", testament: "new", chapters: 6 },
    { name: "Ephesians", abbr: "Eph", testament: "new", chapters: 6 },
    { name: "Philippians", abbr: "Phil", testament: "new", chapters: 4 },
    { name: "Colossians", abbr: "Col", testament: "new", chapters: 4 },
    { name: "1 Thessalonians", abbr: "1Thess", testament: "new", chapters: 5 },
    { name: "2 Thessalonians", abbr: "2Thess", testament: "new", chapters: 3 },
    { name: "1 Timothy", abbr: "1Tim", testament: "new", chapters: 6 },
    { name: "2 Timothy", abbr: "2Tim", testament: "new", chapters: 4 },
    { name: "Titus", abbr: "Titus", testament: "new", chapters: 3 },
    { name: "Philemon", abbr: "Phlm", testament: "new", chapters: 1 },
    { name: "Hebrews", abbr: "Heb", testament: "new", chapters: 13 },
    { name: "James", abbr: "Jas", testament: "new", chapters: 5 },
    { name: "1 Peter", abbr: "1Pet", testament: "new", chapters: 5 },
    { name: "2 Peter", abbr: "2Pet", testament: "new", chapters: 3 },
    { name: "1 John", abbr: "1Jn", testament: "new", chapters: 5 },
    { name: "2 John", abbr: "2Jn", testament: "new", chapters: 1 },
    { name: "3 John", abbr: "3Jn", testament: "new", chapters: 1 },
    { name: "Jude", abbr: "Jd", testament: "new", chapters: 1 },
    { name: "Revelation", abbr: "Rev", testament: "new", chapters: 22 },
  ];

  const BOOK_LOOKUP = {};
  BOOKS.forEach((b, i) => {
    BOOK_LOOKUP[b.name.toLowerCase()] = i;
    BOOK_LOOKUP[b.abbr.toLowerCase()] = i;
    BOOK_LOOKUP[b.name.toLowerCase().replace(/\s+/g, "")] = i;
    BOOK_LOOKUP[b.abbr.toLowerCase().replace(/\s+/g, "")] = i;
  });
  // Extra aliases for common alternate names
  BOOK_LOOKUP["psalm"] = BOOK_LOOKUP["psalms"];  // singular form
  BOOK_LOOKUP["pss"] = BOOK_LOOKUP["psalms"];   // plural abbreviation
  // Spaced abbreviation variants: "1Cor" → "1 cor", "2Sam" → "2 sam", etc.
  BOOKS.forEach((b, i) => {
    const spacedAbbr = b.abbr.replace(/(\d)([A-Za-z])/, "$1 $2").toLowerCase();
    if (spacedAbbr !== b.abbr.toLowerCase() && BOOK_LOOKUP[spacedAbbr] === undefined) {
      BOOK_LOOKUP[spacedAbbr] = i;
    }
  });


  const BOOK_TESTAMENT = {};
  BOOKS.forEach(b => {
    BOOK_TESTAMENT[b.name.toLowerCase()] = b.testament;
    BOOK_TESTAMENT[b.abbr.toLowerCase()] = b.testament;
  });

  // Additional common abbreviations not covered by the abbr field
  const EXTRA_ALIASES = {
    "mt": "Matthew", "ex": "Exodus", "ro": "Romans", "ga": "Galatians",
    "1cori": "1 Corinthians", "2cori": "2 Corinthians",
    "phm": "Philemon", "sos": "Song of Solomon", "cant": "Song of Solomon",
    "songofsongs": "Song of Solomon", "sng": "Song of Solomon",
    "apoc": "Revelation", "apocalypse": "Revelation", "revelations": "Revelation",
    "1thes": "1 Thessalonians", "2thes": "2 Thessalonians",
    "1thess": "1 Thessalonians", "2thess": "2 Thessalonians",
    "1ti": "1 Timothy", "2ti": "2 Timothy",
    "1pe": "1 Peter", "2pe": "2 Peter",
    "jd": "Jude", "ec": "Ecclesiastes", "prv": "Proverbs",
    "exo": "Exodus", "jos": "Joshua", "jdg": "Judges",
    "neh": "Nehemiah", "est": "Esther",
    "jonh": "Jonah", "nah": "Nahum", "zep": "Zephaniah",
    "zec": "Zechariah", "mal": "Malachi", "ob": "Obadiah",
    "joe": "Joel", "amo": "Amos", "ezk": "Ezekiel",
  };
  Object.entries(EXTRA_ALIASES).forEach(([alias, bookName]) => {
    const idx = BOOKS.findIndex(b => b.name === bookName);
    if (idx >= 0 && BOOK_LOOKUP[alias] === undefined) {
      BOOK_LOOKUP[alias] = idx;
      BOOK_TESTAMENT[alias] = BOOKS[idx].testament;
    }
  });

  function romanToNum(roman) {
    const r = roman.toLowerCase();
    const vals = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
    let num = 0;
    for (let i = 0; i < r.length; i++) {
      const cur = vals[r[i]], next = vals[r[i + 1]] || 0;
      num += cur < next ? -cur : cur;
    }
    return num > 0 && num <= 150 ? num : null;
  }

  function findBook(name) {
    // Normalize: lowercase, collapse whitespace, strip trailing periods
    let key = name.toLowerCase().trim().replace(/\s+/g, " ").replace(/\.+$/, "");
    // Convert Roman numeral prefixes: "ii corinthians" → "2 corinthians"
    key = key.replace(/^(i{1,3})\s+/, (m, roman) => roman.length + " ");
    // Convert ordinal prefixes: "1st corinthians" → "1 corinthians"
    key = key.replace(/^(\d)(?:st|nd|rd)\s+/, "$1 ");
    if (BOOK_LOOKUP[key] !== undefined) return BOOKS[BOOK_LOOKUP[key]];
    if (BOOK_LOOKUP[key.replace(/\s+/g, "")] !== undefined) return BOOKS[BOOK_LOOKUP[key.replace(/\s+/g, "")]];
    return null;
  }

  function getTestament(bookName) {
    return BOOK_TESTAMENT[bookName?.toLowerCase()] || null;
  }

  function getBooks() {
    return BOOKS;
  }

  // Clean raw text before parsing: strip "(KJV)", trailing colons, take first line
  function cleanRefInput(text) {
    let cleaned = text.trim();
    // If multi-line, try each line for a verse reference
    const lines = cleaned.split("\n").map(l => l.trim()).filter(l => l);
    for (const line of lines.slice(0, 3)) {
      // Strip trailing parenthetical content like "(KJV)", "(KJV):", "(ESV)", "(NIV)"
      let stripped = line.replace(/\s*\([^)]*\)\s*:?\s*$/, "").replace(/:\s*$/, "").trim();
      // Normalize "ch"/"chapter" prefixes: "John ch 3:16" → "John 3:16"
      stripped = stripped.replace(/\bch(?:apter|\.?)\s+/gi, " ");
      // Normalize v/vv notation: "John 3v16" → "John 3:16", "John 3 vv 16-18" → "John 3:16-18"
      // Only match when a digit (chapter) precedes v/vv to avoid false matches
      stripped = stripped.replace(/(\d)\s*[vV]{1,2}\s*(\d)/g, "$1:$2");
      // Fix double colon: "John 3::16" → "John 3:16"
      stripped = stripped.replace(/::/g, ":");
      // Insert space if no space between book name and number: "John3:16" → "John 3:16"
      stripped = stripped.replace(/([a-zA-Z])(\d+:)/, "$1 $2");
      // Normalize Roman numeral chapters to Arabic: "John III:16" → "John 3:16"
      stripped = stripped.replace(/\s+([ivxlcdm]+)\s*:/i, (m, roman) => {
        const num = romanToNum(roman);
        return num ? " " + num + ":" : m;
      });
      stripped = stripped.replace(/\s+([ivxlcdm]+)\s*$/i, (m, roman) => {
        const num = romanToNum(roman);
        return num ? " " + num : m;
      });
      // Try to extract just the verse reference portion:
      // "Book Name Chapter:VerseSpec" — strip any trailing text after the verse spec
      // e.g. "I Corinthians 15:1-4 The Gospel" → "I Corinthians 15:1-4"
      // Each list item may itself be a plain verse[-verse] or a "chapter:verse[-verse]" jump (e.g. "5:8" or "8:1-2").
      // List items are separated by comma OR semicolon (Bible convention uses ";" between different-chapter refs).
      const listItem = "(?:\\d+\\s*:\\s*)?\\d+(?:\\s*[-\\u2013\\u2014\\u2212]\\s*\\d+(?::\\s*\\d+)?)?";
      const refMatch = stripped.match(
        new RegExp("^(.+?\\s+\\d+\\s*:\\s*" + listItem + "(?:\\s*[,;](?!\\s*\\d\\s+[A-Za-z])\\s*" + listItem + ")*\\s*)")
      );
      if (refMatch) return refMatch[1].trim();
      // Try chapter-only: "Book Name Chapter" followed by other text
      const chapMatch = stripped.match(/^(.+?\s+\d+)\s/);
      if (chapMatch && /^.+?\s+\d+(?:\s*:\s*\d+)?/.test(stripped)) return chapMatch[1].trim();
      // Check if this line looks like a verse reference
      if (/^.+?\s+\d+(?:\s*:\s*\d+)?/.test(stripped)) return stripped;
    }
    // No verse-like line found, return first line cleaned
    return (lines[0] || cleaned).replace(/\s*\([^)]*\)\s*:?\s*$/, "").replace(/:\s*$/, "").trim();
  }

  function parseRef(refStr, opts) {
    // allowBookOnly (default true): when false, a BARE book name (e.g. "Joshua")
    // is NOT treated as a chapter-1 reference. The sidebar search box passes
    // false so typing a book name does a text search (website parity), while
    // page-click detection and other callers keep the open-the-book shortcut.
    const allowBookOnly = !(opts && opts.allowBookOnly === false);
    // --- Multi-book detection (on raw input, before cleanRefInput strips it) ---
    // Split by commas/semicolons and check if any segment starts with a known book name.
    // e.g., "John 3:16, Romans 3:25" → two separate references.
    // But "John 3:16, 18" → one reference (18 is a verse, not a book).
    const rawSegments = refStr.split(/[,;]/).map(s => s.trim()).filter(s => s);
    const rawBookStartIndices = [];
    for (let i = 0; i < rawSegments.length; i++) {
      const seg = rawSegments[i];
      let foundBook = false;
      for (let j = 1; j <= seg.length; j++) {
        const prefix = seg.substring(0, j).trim();
        if (!prefix) continue;
        const book = findBook(prefix);
        if (book) {
          const rest = seg.substring(j).trim();
          if (/^\s*\d/.test(rest) || ((!rest || /^\s*$/.test(rest)) && allowBookOnly)) {
            foundBook = true;
            break;
          }
        }
      }
      if (foundBook) rawBookStartIndices.push(i);
    }

    // If we found multiple book references, parse each one separately
    if (rawBookStartIndices.length > 1) {
      const multiRefs = [];
      for (let bi = 0; bi < rawBookStartIndices.length; bi++) {
        const startIdx = rawBookStartIndices[bi];
        const endIdx = (bi + 1 < rawBookStartIndices.length) ? rawBookStartIndices[bi + 1] : rawSegments.length;
        const refParts = rawSegments.slice(startIdx, endIdx);
        const refStrPart = refParts.join(', ');
        const subRef = parseRef(refStrPart);
        if (subRef) {
          multiRefs.push(subRef);
        }
      }
      if (multiRefs.length > 0) {
        // Return a shallow copy of the first ref as the primary,
        // with multiRefs array (without circular reference)
        const first = multiRefs[0];
        const primary = {
          book: first.book,
          chapter: first.chapter,
          endChapter: first.endChapter,
          verse: first.verse,
          endVerse: first.endVerse,
          verseList: first.verseList,
          multiRefs: multiRefs.map(r => ({
            book: r.book,
            chapter: r.chapter,
            endChapter: r.endChapter,
            verse: r.verse,
            endVerse: r.endVerse,
            verseList: r.verseList,
          })),
        };
        return primary;
      }
    }

    const trimmed = cleanRefInput(refStr);
    // Normalize dash characters to ASCII hyphen, and dots between digits to colons (e.g. 'John 3.16' → 'John 3:16')
    let normalized = trimmed.replace(/[\u2013\u2014\u2212]/g, '-').replace(/(\d)\.(\d)/g, '$1:$2');
    // Strip ff suffix: "John 3:16ff" → "John 3:16"
    normalized = normalized.replace(/ff\b/gi, "");
    // Strip trailing "v" or "vv" before verse numbers: "John 3 v 16" already handled
    normalized = normalized.trim();

    // 1. Try chapter range: "John 1-3" or "John 1-3:16"
    const chapRangeMatch = normalized.match(/^(.+?)\s+(\d+)-(\d+)(?::(.+))?\s*$/);
    if (chapRangeMatch) {
      const book = findBook(chapRangeMatch[1]);
      if (book) {
        const verseSpec = chapRangeMatch[4] ? chapRangeMatch[4].trim() : null;
        const verseList = verseSpec ? parseVerseSpec(verseSpec) : null;
        return {
          book: book.name,
          chapter: parseInt(chapRangeMatch[2]),
          endChapter: parseInt(chapRangeMatch[3]),
          verse: verseList ? verseList[0].verse : null,
          endVerse: verseList ? verseList[0].endVerse : null,
          verseList: verseList,
        };
      }
    }

    // 2. Try chapter:verse: "John 3:16" or "John 3:16-18"
    const refMatch = normalized.match(/^(.+?)\s+(\d+)(?::(.+))?\s*$/);
    if (refMatch) {
      const book = findBook(refMatch[1]);
      if (book) {
        const chapter = parseInt(refMatch[2]);
        const verseSpec = refMatch[3] ? refMatch[3].trim() : null;

        if (!verseSpec) {
          // Chapter only: "John 3"
          return {
            book: book.name,
            chapter: chapter,
            endChapter: null,
            verse: null,
            endVerse: null,
            verseList: null,
          };
        }

        // Has colon — parse verse spec
        const verseList = parseVerseSpec(verseSpec);
        return {
          book: book.name,
          chapter: chapter,
          endChapter: null,
          verse: verseList ? verseList[0].verse : null,
          endVerse: verseList ? verseList[0].endVerse : null,
          verseList: verseList,
        };
      }
    }

    // 3. Book-only reference (e.g. "Romans", "Ephesians") — default to chapter 1.
    // Skipped when allowBookOnly is false (sidebar search: bare book names are
    // ALWAYS keyword searches, matching the website — even one-chapter books
    // like Jude and Obadiah, whose names also appear elsewhere in Scripture.
    // The results view shows an "open this book" shortcut; a reference with a
    // chapter or verse still opens the book directly.)
    if (allowBookOnly) {
      const bookOnly = findBook(trimmed);
      if (bookOnly) {
        return {
          book: bookOnly.name,
          chapter: 1,
          endChapter: null,
          verse: null,
          endVerse: null,
          verseList: null,
        };
      }
    }
    return null;
  }

  // Parse a verse spec like "16", "16-18", "16,18", "16-18,20" into a list of {verse, endVerse}
  // Parse a verse spec like "16", "16-18", "16,18", "16-4:10", "7,8:1-2" into a list of {verse, endVerse, crossChapter, crossChapterEndVerse, crossChapterStartVerse}
  function parseVerseSpec(spec) {
    // Normalize dashes to ASCII hyphen
    let normSpec = spec.replace(/[–—−]/g, '-');
    // A bare "N;M" (semicolon directly between two numbers, no colon already present) is almost
    // always a colon typo — semicolon (;) is the unshifted key for colon (:) on most keyboards.
    // e.g. "5;8" meant as "5:8" (chapter 5, verse 8). Only fix when M isn't already followed by ":verse"
    // (that pattern, e.g. "25; 5:8", is a legitimate semicolon list separator and left alone below).
    normSpec = normSpec.replace(/(\d+)\s*;\s*(\d+)(?!\s*:)/g, "$1:$2");
    // Any remaining semicolons are genuine list separators (Bible convention: ";" between different-chapter refs)
    normSpec = normSpec.replace(/;/g, ',');
    const parts = normSpec.split(",").map(s => s.trim()).filter(s => s);
    const list = [];
    // Bible verse/chapter numbers always start at 1 — "0" never refers to a
    // real verse. Downstream, a verse of 0 is falsy, so code that checked
    // `if (verse)` before forwarding it (e.g. the getVerse API call) silently
    // dropped it — turning "Genesis 1:0" into a plain "Genesis 1" chapter
    // request, which then got treated as if every one of its returned verses
    // matched the request and got highlighted. Rejecting 0 here, at the one
    // place all verse specs are parsed (typed search and page-detected
    // clicks both funnel through this), stops the bad reference before it
    // can reach that code at all.
    const noZero = (...nums) => nums.every(n => n === null || n === undefined || n !== 0);
    for (const part of parts) {
      // Try cross-chapter range pattern: "16-4:10" (verse-chapter:verse)
      const crossMatch = part.match(/^(\d+)-(\d+):(\d+)$/);
      if (crossMatch) {
        const verse = parseInt(crossMatch[1]);
        const crossChapter = parseInt(crossMatch[2]);
        const crossChapterEndVerse = parseInt(crossMatch[3]);
        if (!noZero(verse, crossChapter, crossChapterEndVerse)) continue;
        list.push({
          verse,
          endVerse: null,
          crossChapter,
          crossChapterStartVerse: null,
          crossChapterEndVerse,
        });
        continue;
      }
      // Try standalone cross-chapter reference: "8:1-2" or "8:1" (chapter:verse[-verse])
      const chapVerseMatch = part.match(/^(\d+):(\d+)(?:-(\d+))?$/);
      if (chapVerseMatch) {
        const crossChapter = parseInt(chapVerseMatch[1]);
        const crossChapterStartVerse = parseInt(chapVerseMatch[2]);
        const crossChapterEndVerse = chapVerseMatch[3] ? parseInt(chapVerseMatch[3]) : parseInt(chapVerseMatch[2]);
        if (!noZero(crossChapter, crossChapterStartVerse, crossChapterEndVerse)) continue;
        list.push({
          verse: null,
          endVerse: null,
          crossChapter,
          crossChapterStartVerse,
          crossChapterEndVerse,
        });
        continue;
      }
      // Try same-chapter range or single verse: "16" or "16-18"
      const simpleMatch = part.match(/^(\d+)(?:-(\d+))?$/);
      if (simpleMatch) {
        const verse = parseInt(simpleMatch[1]);
        const endVerse = simpleMatch[2] ? parseInt(simpleMatch[2]) : null;
        if (!noZero(verse, endVerse)) continue;
        list.push({
          verse,
          endVerse,
          crossChapter: null,
          crossChapterStartVerse: null,
          crossChapterEndVerse: null,
        });
      }
    }
    return list.length > 0 ? list : null;
  }

  function wildcardToRegex(pattern, caseSensitive = false) {
    const escaped = pattern.replace(/[.*+^${}()|[\]\\]/g, (m) => {
      if (m === "?") return ".";
      if (m === "*") return ".*";
      return "\\" + m;
    });
    return new RegExp(escaped, caseSensitive ? "" : "i");
  }

  function hasLiteralSpecialChars(query) {
    return /[¶\[\]]/.test(query);
  }

  function toPlainText(text) {
    return text
      .replace(/¶/g, '')
      .replace(/\[([^\]]*)\]/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getReadUrl(book, chapter, verse) {
    let url = `${KJB_WEBSITE}/read?book=${encodeURIComponent(book)}&chapter=${chapter}&from=extension`;
    // `if (verse)` treated a legitimate verse of 0 the same as "no verse" and
    // silently dropped it. Verse 0 shouldn't occur post-parseVerseSpec, but
    // checking explicitly for null/undefined keeps this correct regardless.
    if (verse !== null && verse !== undefined) url += `&verse=${verse}`;
    return url;
  }

  // --- API Methods ---

  async function search(query, options = {}) {
    const {
      wholeWord = false,
      testament = "all",
      book = "",
      caseSensitive = false,
      wildcard = true,
      limit = null, // null = show every match; only clip if a caller explicitly asks for a cap
    } = options;

    const hasSpecial = hasLiteralSpecialChars(query);
    let apiQuery = query;
    let clientWildcardFilter = null;

    if (wildcard && !hasSpecial && (query.includes("?") || query.includes("*"))) {
      apiQuery = query.replace(/[?*]/g, "");
      if (apiQuery.length < 2) apiQuery = query;
      clientWildcardFilter = wildcardToRegex(query, caseSensitive);
    }

    // The KJV has ~31,102 verses total, so this comfortably covers a match
    // on every single one — i.e. there is no real word or phrase that could
    // ever legitimately exceed this in one request. This used to be capped
    // much lower (500, or 150 for a plain unfiltered search), which silently
    // cut long result lists off mid-Bible with no indication anything was
    // missing. E.g. searching "chariot" without Whole Word also matches
    // every "chariots"/"chariot's" verse, pushing the combined total past
    // the old cap — the list stopped at 2 Chronicles while the true last
    // match is much later, with nothing on screen suggesting results were
    // being withheld.
    const MAX_VERSES = 35000;
    const apiBody = {
      action: "search",
      query: apiQuery,
      wholeWord,
      caseSensitive,
      limit: MAX_VERSES,
    };
    if (testament !== "all") apiBody.testament = testament;
    if (book) apiBody.book = book;
    if (wildcard && !hasSpecial) apiBody.wildcard = true;

    const data = await apiCall(apiBody);
    let results = data.results || [];

    // Multi-word fallback: if no results and query has multiple words,
    // search the RAREST word first (fewest API hits), then client-side
    // filter those results to keep only verses containing ALL words.
    // This avoids the 500-result API limit cutting off verses when a
    // common word (e.g. "men" with 3224 hits) overflows the limit.
    if (results.length === 0 && !hasSpecial && !clientWildcardFilter) {
      const words = [...new Set(query.toLowerCase().split(/[\s,]+/).filter(w => w.length >= 2))];
      if (words.length >= 2) {
        // Search each word to find result counts, pick the rarest
        const wordData = await Promise.all(
          words.map(w => {
            const wordBody = {
              action: "search",
              query: w,
              wholeWord: false,
              caseSensitive: false,
              limit: MAX_VERSES,
            };
            if (testament !== "all") wordBody.testament = testament;
            if (book) wordBody.book = book;
            return apiCall(wordBody).then(d => ({ word: w, data: d }));
          })
        );

        // Sort by result count ascending (rarest first)
        wordData.sort((a, b) => (a.data?.total ?? 0) - (b.data?.total ?? 0));

        // Start with all results from the rarest word
        const rarestResults = (wordData[0].data?.results || []).map(r => ({ ...r, _matchWord: wordData[0].word }));
        const otherWords = words.filter(w => w !== wordData[0].word);

        if (otherWords.length === 0) {
          results = rarestResults;
        } else {
          // Filter rarest results: keep only verses whose text contains ALL other words
          results = rarestResults.filter(r => {
            const text = (toPlainText(r.text || r.content || "")).toLowerCase();
            return otherWords.every(w => text.includes(w));
          });
        }
      }
    }

    if (clientWildcardFilter) {
      results = results.filter(r => {
        const text = toPlainText(r.text || r.content || "");
        return clientWildcardFilter.test(text);
      });
    }

    if (book) {
      const bookLower = book.toLowerCase();
      results = results.filter(r => {
        const rBook = (r.book || "").toLowerCase();
        return rBook === bookLower || rBook.replace(/\s+/g, "") === bookLower.replace(/\s+/g, "");
      });
    }

    if (caseSensitive && !hasSpecial) {
      const terms = query.toLowerCase().split(/[\s,]+/).filter(t => t.length > 0);
      if (terms.length > 0) {
        results = results.filter(r => {
          const text = toPlainText(r.text || "");
          return terms.every(term => text.includes(term));
        });
      }
    }

    if (wholeWord && !hasSpecial) {
      const terms = query.split(/[\s,]+/).filter(t => t.length > 0);
      results = results.filter(r => {
        const text = toPlainText(r.text || "");
        return terms.every(term => {
          const re = new RegExp(`(?<![A-Za-z'-])${escapeRegex(term)}(?![A-Za-z'-])`, 'i');
          return re.test(text);
        });
      });
    }

    // Only clip if a caller explicitly asked for a cap. Nobody currently
    // does — searchKeyword() in sidebar.js calls this with no limit option
    // — so by default every match found is kept and shown; nothing is
    // silently dropped after this point.
    if (limit) results = results.slice(0, limit);

    return {
      results,
      total: data.total || results.length,
      count: results.length,
      query,
      testament: data.testament || testament,
      wholeWord: data.wholeWord ?? wholeWord,
      caseSensitive: data.caseSensitive ?? caseSensitive,
      wildcard: data.wildcard ?? wildcard,
    };
  }

  async function getVerse(book, chapter, verse, endVerse) {
    const body = { action: "getVerse", book, chapter };
    // `if (verse)` / `if (endVerse)` treated 0 as "not provided" and silently
    // omitted it, so a request for verse 0 silently became a request for the
    // whole chapter instead of failing as "not found". parseVerseSpec now
    // rejects verse 0 before it gets this far, but checking explicitly here
    // too means this function is correct on its own, independent of callers.
    if (verse !== null && verse !== undefined) body.verse = verse;
    if (endVerse !== null && endVerse !== undefined) body.endVerse = endVerse;
    return await apiCall(body);
  }


  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  return {
    search,
    getVerse,
    parseRef,
    findBook,
    getTestament,
    getBooks,
    getBaseUrl,
    setBaseUrl,
    getWebsiteUrl,
    getReadUrl,
    toPlainText,
    hasLiteralSpecialChars,
    wildcardToRegex,
  };
})();
