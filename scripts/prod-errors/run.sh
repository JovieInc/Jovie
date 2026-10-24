#!/usr/bin/env bash
# Self-update from the gem lanes mirror's origin/main (the lanes tick fetches it every 5 min; no
# clone or fetch here). A new tree goes live only after its tests pass. Then run one command.
set -euo pipefail
base="${PROD_ERRORS_HOME:-$HOME/.local/share/jovie-prod-errors}"
repo="${LANES_REPO:-$HOME/devin-sweep/Jovie}"
live="$base/current"
exec 9>"$base/.update.lock"
if flock -w 60 9 && head="$(git -C "$repo" rev-parse -q --verify origin/main:scripts/prod-errors 2>/dev/null)" &&
   [ "$(cat "$live/.tree" 2>/dev/null)" != "$head" ]; then
  rm -rf "$base/next" && mkdir -p "$base/next"
  git -C "$repo" archive origin/main scripts/prod-errors | tar -x -C "$base/next" --strip-components=2
  if (cd "$base/next" && python3 -m unittest -q test_prod_errors >/dev/null 2>&1); then
    echo "$head" >"$base/next/.tree" && rm -rf "$live.prev" && { [ ! -d "$live" ] || mv "$live" "$live.prev"; }
    mv "$base/next" "$live"
  fi
fi
flock -u 9
exec python3 "$live/prod_errors.py" "$@"
