# Farenheit

Local HTTP service that watches your iCloud `Livros` folder and serves epubs to the Kobo's experimental web browser. List-style UI, per-device download tracking, capas em cor.

Design: `docs/superpowers/specs/2026-04-21-farenheit-design.md`

## Requirements

- macOS (watcher uses filesystem events; download path uses `brctl` for iCloud dataless)
- [Bun](https://bun.sh) — install via:
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```
- iCloud Drive enabled with a `Livros` folder containing `.epub` files

## Setup (one command)

```bash
./bin/farenheit install
```

This installs dependencies, sets up a launchd agent (auto-starts on login, restarts on crash), and symlinks the `farenheit` command onto your PATH (`~/.local/bin` or `/usr/local/bin` — whichever is writable).

To override the books folder:
```bash
BOOKS_DIR="/path/to/Livros" ./bin/farenheit install
```

After install, the `farenheit` command is available globally.

## Daily usage

```bash
farenheit status       # state + URL + last log lines
farenheit url          # just the LAN URL (copy to Kobo)
farenheit logs -f      # tail -f the log
farenheit restart      # bounce the service
farenheit open         # open the UI in your Mac browser
farenheit stop         # stop it
farenheit start        # start it
farenheit uninstall    # remove launchd + symlink
```

## Accessing from the Kobo

1. Mac on the same wifi as the Kobo.
2. Get the URL:
   ```bash
   farenheit url
   ```
3. On the Kobo: **More → Settings → Beta Features → Web Browser**.
4. Type the URL. Bookmark for next time.
5. Tap a book → tap **Baixar no Kobo** → epub downloads and appears in the library.

## Manual run (without launchd)

Useful for debugging:
```bash
bun install
bun tests/fixtures/build.ts        # one-time: builds test fixtures

BOOKS_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Livros" \
  bun run start
```

## Run tests

```bash
bun test
```

## Configuration

Env vars used by the launchd service and the `start` script:

| var          | default                                          | notes                              |
|--------------|--------------------------------------------------|------------------------------------|
| `BOOKS_DIR`  | `~/Library/Mobile Documents/com~apple~CloudDocs/Livros` | path to your Livros folder  |
| `PORT`       | `1111`                                           | HTTP port                          |
| `HOST`       | `0.0.0.0`                                        | bind host                          |
| `DATA_DIR`   | `<project>/data`                                 | SQLite + covers + log location     |

To change any of these after install, edit `~/Library/LaunchAgents/com.farenheit.plist` and run `farenheit restart`.

## Project layout

```
bin/
  farenheit       # CLI wrapper (install/start/stop/status/logs/open/url)
src/
  indexer/        # scan folder + parse epubs + build covers
  store/          # SQLite persistence
  server/         # Bun.serve + templates + routes
tests/            # unit / integration / e2e
launchd/          # plist template + installer
data/             # runtime — SQLite, covers, log (gitignored)
```
