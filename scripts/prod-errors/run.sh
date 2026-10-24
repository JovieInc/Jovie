#!/usr/bin/env bash
# Drain-safe self-update from origin/main (tests must pass before a new tree goes live), then run.
#   run.sh <sweep|ci-main|deadman|synthetic|receive>
set -euo pipefail
base="${PROD_ERRORS_HOME:-$HOME/.local/share/jovie-prod-errors}"
src="$base/src"
live="$base/current"
if [ ! -d "$src/.git" ]; then
  git clone --quiet --filter=blob:none --no-checkout https://github.com/JovieInc/Jovie.git "$src"
  git -C "$src" sparse-checkout set scripts/prod-errors
fi
if git -C "$src" fetch --quiet origin main 2>/dev/null; then
  git -C "$src" checkout --quiet --force origin/main
  head="$(git -C "$src" rev-parse HEAD)"
  if [ "$(cat "$live/.commit" 2>/dev/null)" != "$head" ] &&
     (cd "$src/scripts/prod-errors" && python3 -m unittest -q test_prod_errors >/dev/null 2>&1); then
    rm -rf "$live.next" && cp -r "$src/scripts/prod-errors" "$live.next" && echo "$head" >"$live.next/.commit"
    rm -rf "$live.prev" && { [ -d "$live" ] && mv "$live" "$live.prev" || true; } && mv "$live.next" "$live"
  fi
fi
exec python3 "$live/prod_errors.py" "$@"
