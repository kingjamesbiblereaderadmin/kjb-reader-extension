# KJB Reader Sidebar Extension

A Chrome browser extension that connects to the KJB Reader API for quick Bible verse lookup and advanced search.

## Features

- **Sidebar panel** — Search verses and references from any web page
- **Verse reference detection** — Automatically detects Bible references on web pages (like "John 3:16") and makes them clickable to open in the sidebar
- **Right-click lookup** — Select text, right-click, and choose "Look up verse" to search in the sidebar
- **Advanced search** — Match whole word, filter by Testament (Old/New), filter by book, case-sensitive, and wildcard support
- **Wildcard patterns** — Use `?` for any single character, `*` for any string (e.g. "lov?" finds love, live...)
- **History & Favorites** — Track your recent searches and star verses for later

## Installation (Developer Mode)

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in the top-right)
3. Click "Load unpacked"
4. Select the `kjb-extension` folder
5. The KJB Reader icon appears in your toolbar

## Usage

- **Click the toolbar icon** to open the sidebar
- **Search**: Type a verse reference (e.g. "John 3:16") or keyword (e.g. "love")
- **On web pages**: Bible references are automatically highlighted — click them to look up in the sidebar
- **Right-click**: Select any text, right-click → "Look up verse: [text]"
- **Advanced search**: Click "Advanced search" to expand options (whole word, testament, book, case-sensitive, wildcards)

## Architecture

```
manifest.json     — Manifest V3 config
background.js      — Service worker (context menus, side panel, API proxy)
content.js         — Verse reference detection on web pages
content.css        — Styles for highlighted verse links
sidebar.html       — Sidebar panel UI
sidebar.css        — Sidebar styling (light/dark mode)
sidebar.js         — Sidebar logic (search, history, favorites)
api.js              — API module (KJB Reader backend communication)
icons/             — Extension icons
```

## API Configuration

The extension connects to the KJB Reader backend. The API base URL is configurable in Settings (gear icon in sidebar). By default it points to the KJB Reader Base44 app.

The extension expects two backend endpoints:
- `searchBible` — Search verses by keyword/pattern with filters
- `getVerse` — Get specific verse or verse range by reference

## Notes

- Uses Chrome Manifest V3 with the Side Panel API (Chrome 114+)
- API requests are proxied through the background service worker to avoid CORS issues
- Supports light and dark mode
