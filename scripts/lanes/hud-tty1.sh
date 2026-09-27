#!/usr/bin/env bash
# Symphony HUD on the Gem console. Runs the *current* release's hud.py; the HUD re-execs
# itself when `current` moves, so this wrapper never needs a restart for an update.
# If the current release cannot even render one frame, fall back to the newest release
# that can, so the office display never sits on a crash loop.
set -euo pipefail
state="${LANES_STATE:-$HOME/.local/state/jovie-lanes}"
candidates=("$state/current/hud.py")
for release in $(ls -t "$state/releases" 2>/dev/null); do
  candidates+=("$state/releases/$release/scripts/lanes/hud.py")
done
for hud in "${candidates[@]}"; do
  [ -f "$hud" ] || continue
  if timeout 120 python3 "$hud" --once --width 160 --height 45 >/dev/null 2>&1; then
    exec python3 "$hud" "$@"
  fi
  echo "hud-tty1: $hud failed its smoke render; trying the previous release" >&2
done
echo "hud-tty1: no release can render; retrying in 30s" >&2
sleep 30
exit 1
