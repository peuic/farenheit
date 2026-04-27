#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.."; pwd)"
BUN_PATH="$(command -v bun || echo "$HOME/.bun/bin/bun")"
BOOKS_DIR_DEFAULT="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Livros"
BOOKS_DIR="${BOOKS_DIR:-$BOOKS_DIR_DEFAULT}"
# Optional Basic Auth — only takes effect when *both* env vars are set.
# Empty string in plist → JS sees "" → config disables auth.
FARENHEIT_USER_VAL="${FARENHEIT_USER:-}"
FARENHEIT_PASS_VAL="${FARENHEIT_PASS:-}"

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
  -e "s|__FARENHEIT_USER__|$FARENHEIT_USER_VAL|g" \
  -e "s|__FARENHEIT_PASS__|$FARENHEIT_PASS_VAL|g" \
  "$PROJECT_DIR/launchd/com.farenheit.plist.template" > "$OUT"

if [[ -n "$FARENHEIT_USER_VAL" && -n "$FARENHEIT_PASS_VAL" ]]; then
  echo "Basic Auth enabled (user: $FARENHEIT_USER_VAL)"
else
  echo "Basic Auth disabled (LAN-only mode)"
fi

echo "wrote $OUT"

launchctl unload "$OUT" 2>/dev/null || true
launchctl load "$OUT"

echo "installed. Check status:"
echo "  launchctl list | grep farenheit"
echo "  tail -f $PROJECT_DIR/data/farenheit.log"
