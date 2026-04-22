# Farenheit

A tiny, self-hosted catalog that serves your epub library to an e-reader's built-in web browser. Watches a local folder, builds a list, and lets you tap through pages on a Kobo / Kindle / Boox / reMarkable without any cable, account, or cloud middleware.

Optimized for the real-world constraints of e-ink displays: zero-JS markup, paginated views (no infinite scroll), large tap targets, solid-filled buttons, and a typographic layout that renders cleanly on old WebKit-based browsers.

> Farenheit is a deliberate nod to Bradbury's *Fahrenheit 451* — the temperature at which paper burns, now reclaimed as the temperature at which books reach you.

## Features

- **Auto-sync** — drop an `.epub` into your watched folder (e.g. iCloud Drive `Books`) and it shows up automatically; remove it and it disappears.
- **Covers** — extracted from each epub, resized to WebKit-safe JPEG (≤ 400 px wide).
- **Library catalog UI** — warm paper aesthetic, serif typography, solid dark buttons, per-page navigation with ← / → chevrons. 6 books per page by default.
- **Sort** by recently added, title, or author. Alphabet jump strip skips straight to the page where a letter starts.
- **Per-device download tracking** — each e-reader gets a cookie UUID; downloaded books are visibly marked so you don't re-download what's already on the device.
- **iCloud-aware** — detects dataless placeholders (files in iCloud but not yet materialized locally), marks them in the UI with a retry action that invokes `brctl download`.
- **LAN only** — no external dependencies. No account. No server round trip beyond your own Mac.

## How it compares to alternatives

| | Farenheit | Calibre Web | `send.djazz.se` |
|---|---|---|---|
| Auto-sync from a folder | ✅ | ❌ (manual upload) | ❌ (one-at-a-time) |
| Works offline / LAN-only | ✅ | ✅ | ❌ (needs Rakuten) |
| E-ink optimized UI | ✅ | ⚠️ generic | N/A |
| Setup complexity | one command | medium | none (but limited) |

## Requirements

- **macOS** — the iCloud-placeholder detection uses `brctl`, which is macOS-specific.
- **[Bun](https://bun.sh)** — a fast JS runtime used for the server. Install with:
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```
- A folder of `.epub` files, anywhere on disk. iCloud Drive works; a plain local folder works too.

## Quick start

```bash
git clone https://github.com/<you>/farenheit.git
cd farenheit

# Point at your books folder (any absolute path)
BOOKS_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Books" \
  ./bin/farenheit install
```

`install` will:

1. Run `bun install` to grab dependencies.
2. Generate a launchd agent that auto-starts the server on login and restarts on crash.
3. Symlink `farenheit` onto your `$PATH` (in `~/.local/bin` or `/usr/local/bin`, whichever is writable).
4. Start the service and print the LAN URL.

> **Full Disk Access** — on macOS Sonoma and later, the launchd agent needs Full Disk Access to read files inside `~/Library/Mobile Documents/`. If you see `EDEADLK` errors in `data/farenheit.log`, open **System Settings → Privacy & Security → Full Disk Access**, click **+**, and add `~/.bun/bin/bun`.

## Daily usage

Once installed, the `farenheit` CLI handles the whole service lifecycle:

```bash
farenheit url          # print the LAN URL, handy to copy to the e-reader
farenheit status       # service state, current URL, last log lines
farenheit logs -f      # tail -f the log
farenheit open         # open the UI in your Mac browser
farenheit restart      # bounce after config or code changes
farenheit stop         # stop the service
farenheit start        # start it again
farenheit uninstall    # remove the launchd agent and the CLI symlink
```

## Accessing from the e-reader

1. Put the Mac and the e-reader on the same Wi-Fi network.
2. Copy the LAN URL:
   ```bash
   farenheit url
   # → http://192.168.1.42:1111
   ```
3. On the e-reader, open the experimental web browser:
   - **Kobo:** `More → Settings → Beta Features → Web Browser`
   - **Kindle:** `Menu → Experimental → Web Browser` (older models only)
   - **Boox / reMarkable / others:** any built-in browser works if it's WebKit-based
4. Enter the URL. Bookmark it.
5. Tap a book → tap **Download** → the epub is saved to the device library.

## Configuration

Environment variables (all optional except `BOOKS_DIR`):

| Variable | Default | Description |
|---|---|---|
| `BOOKS_DIR` | *required* | Absolute path to the folder containing your `.epub` files. Subfolders become categories. |
| `PORT` | `1111` | HTTP port. |
| `HOST` | `0.0.0.0` | Bind address. Leave as-is for LAN access. |
| `DATA_DIR` | `./data` | Where the SQLite index, cover thumbnails, and log live. |

To change any of these after install, edit `~/Library/LaunchAgents/com.farenheit.plist` and run `farenheit restart`.

## Development

```bash
bun install
bun tests/fixtures/build.ts    # one-time: build epub test fixtures

# Run the server directly (no launchd)
BOOKS_DIR="$HOME/Books" bun run src/index.ts

# Tests (43 across unit / integration / e2e)
bun test
```

### Project layout

```
bin/              # farenheit CLI (shell script)
src/
  indexer/        # folder scan + epub parser + cover extraction + iCloud watcher
  store/          # SQLite persistence
  server/         # Bun.serve routes + HTML templates
tests/            # unit · integration · e2e
launchd/          # macOS user agent plist template + install script
data/             # runtime — SQLite, covers, log (gitignored)
```

The HTML templates deliberately avoid flexbox, grid, and modern CSS — the Kobo browser is a very old WebKit that ignores anything newer than ~2015. Layouts use HTML tables for multi-column alignment, floats for image-plus-text rows, and `position: static` everywhere.

## License

[MIT](LICENSE)
