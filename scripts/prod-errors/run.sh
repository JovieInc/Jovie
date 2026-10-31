#!/usr/bin/env bash
# Self-update from the gem lanes mirror's origin/main (the lanes tick fetches it every 5 min; no
# clone or fetch here). A new tree goes live only after its tests pass. Then run one command.
# prod_errors.py imports the shared scripts/apiclient layer, whose contract reads
# packages/api-client/providers.json two dirs up from itself, so the live tree ships the same
# repo-relative layout as the repo (scripts/{prod-errors,apiclient} + packages/api-client).
# Archiving only scripts/prod-errors left every candidate tree failing its own tests, so the
# loop froze on a stale tree; a flat current/prod_errors.py can never import apiclient. The
# legacy flat layout is still exec'd as a fallback so an old host keeps running until the first
# successful update swaps in the full tree.
set -euo pipefail
base="${PROD_ERRORS_HOME:-$HOME/.local/share/jovie-prod-errors}"
repo="${LANES_REPO:-$HOME/devin-sweep/Jovie}"
live="$base/current"
exec 9>"$base/.update.lock"
h1="$(git -C "$repo" rev-parse -q --verify origin/main:scripts/prod-errors 2>/dev/null)" || h1=""
h2="$(git -C "$repo" rev-parse -q --verify origin/main:scripts/apiclient 2>/dev/null)" || h2=""
h3="$(git -C "$repo" rev-parse -q --verify origin/main:packages/api-client 2>/dev/null)" || h3=""
if flock -w 60 9 && [ -n "$h1" ] && [ -n "$h2" ] && [ -n "$h3" ] &&
   [ "$h1$h2$h3" != "$(cat "$live/.tree" 2>/dev/null)" ]; then
  rm -rf "$base/next" && mkdir -p "$base/next"
  if git -C "$repo" archive origin/main scripts/prod-errors scripts/apiclient packages/api-client | tar -x -C "$base/next" &&
     (cd "$base/next/scripts/prod-errors" && python3 -m unittest -q test_prod_errors >/dev/null 2>&1); then
    echo "$h1$h2$h3" >"$base/next/.tree" && rm -rf "$live.prev" && { [ ! -d "$live" ] || mv "$live" "$live.prev"; }
    mv "$base/next" "$live"
  fi
fi
flock -u 9
if [ -f "$live/scripts/prod-errors/prod_errors.py" ]; then exec python3 "$live/scripts/prod-errors/prod_errors.py" "$@"; fi
if [ -f "$live/prod_errors.py" ]; then exec python3 "$live/prod_errors.py" "$@"; fi
echo "prod-errors: no runnable prod_errors.py under $live -- tree layout broken; re-run scripts/prod-errors/install.sh" >&2
exit 2
