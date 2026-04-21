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

## Quick start (manual run)

```bash
bun install
bun tests/fixtures/build.ts        # one-time: builds test fixtures

BOOKS_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Livros" \
  bun run start
```

Output includes the LAN URL, e.g. `http://10.0.0.31:1111`.

## Run tests

```bash
bun test
```

## Run as a macOS service (launchd)

```bash
./launchd/install.sh
```

Override the books dir:
```bash
BOOKS_DIR="/path/to/Livros" ./launchd/install.sh
```

Operations:
```bash
launchctl list | grep farenheit                              # status
launchctl unload ~/Library/LaunchAgents/com.farenheit.plist  # stop
launchctl load   ~/Library/LaunchAgents/com.farenheit.plist  # start
tail -f data/farenheit.log                                   # logs
```

## Accessing from the Kobo

1. Mac on the same wifi as the Kobo.
2. Find the LAN IP in `data/farenheit.log` (line `→ http://10.0.0.x:1111`).
3. On the Kobo: **More → Settings → Beta Features → Web Browser**.
4. Type the URL. Bookmark for next time.
5. Tap a book → tap **Baixar no Kobo** → epub downloads and appears in the library.

## Configuration

Env vars:

| var          | default                                          | notes                              |
|--------------|--------------------------------------------------|------------------------------------|
| `BOOKS_DIR`  | _required_                                       | path to your Livros folder         |
| `PORT`       | `1111`                                           | HTTP port                          |
| `HOST`       | `0.0.0.0`                                        | bind host                          |
| `DATA_DIR`   | `./data`                                         | SQLite + covers + log location     |

## Project layout

```
src/
  indexer/    # scan folder + parse epubs + build covers
  store/      # SQLite persistence
  server/     # Bun.serve + templates + routes
tests/        # unit / integration / e2e
launchd/      # macOS service install
```
