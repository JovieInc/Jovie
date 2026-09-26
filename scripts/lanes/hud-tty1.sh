#!/usr/bin/env bash
# Symphony HUD on the Gem console. Runs the *current* release's hud.py; the HUD re-execs
# itself when `current` moves, so this wrapper never needs a restart for an update.
set -euo pipefail
state="${LANES_STATE:-$HOME/.local/state/jovie-lanes}"
exec python3 "$state/current/hud.py" "$@"
