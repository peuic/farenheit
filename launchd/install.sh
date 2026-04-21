#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.."; pwd)"
BUN_PATH="$(command -v bun || echo "$HOME/.bun/bin/bun")"
BOOKS_DIR_DEFAULT="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Livros"
BOOKS_DIR="${BOOKS_DIR:-$BOOKS_DIR_DEFAULT}"

if [[ ! -x "$BUN_PATH" ]]; then
  echo "error: bun not found (tried \$PATH and $HOME/.bun/bin/bun)" >&2
  echo "install it first: curl -fsSL https://bun.sh/install | bash" >&2
  exit 1
fi

if [[ ! -d "$BOOKS_DIR" ]]; then
  echo "error: BOOKS_DIR does not exist: $BOOKS_DIR" >&2
  echo "set BOOKS_DIR env var and re-run, e.g.:" >&2
  echo "  BOOKS_DIR=/path/to/Livros ./launchd/install.sh" >&2
  exit 1
fi

OUT="$HOME/Library/LaunchAgents/com.farenheit.plist"
mkdir -p "$(dirname "$OUT")"

sed \
  -e "s|__PROJECT_DIR__|$PROJECT_DIR|g" \
  -e "s|__BUN_PATH__|$BUN_PATH|g" \
  -e "s|__BOOKS_DIR__|$BOOKS_DIR|g" \
  "$PROJECT_DIR/launchd/com.farenheit.plist.template" > "$OUT"

echo "wrote $OUT"

launchctl unload "$OUT" 2>/dev/null || true
launchctl load "$OUT"

echo "installed. Check status:"
echo "  launchctl list | grep farenheit"
echo "  tail -f $PROJECT_DIR/data/farenheit.log"
