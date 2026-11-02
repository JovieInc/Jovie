#!/usr/bin/env bash
# Install the Hyperagent board bridge from this repo as a systemd user service on Gem.
#   bash scripts/hyperagent/install-board-bridge.sh
# Copies board_bridge.py into the bridge state dir (the token and run counters already live there)
# and points the unit at it. Idempotent. ROLLBACK: the previous script is kept as *.prev.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dest="$HOME/.jovie/mesh/hyperagent-bridge"
mkdir -p "$dest" "$HOME/.config/systemd/user"
[ -f "$dest/hyperagent-bridge.py" ] && cp "$dest/hyperagent-bridge.py" "$dest/hyperagent-bridge.py.prev"
install -m 0755 "$here/board_bridge.py" "$dest/hyperagent-bridge.py"
install -m 0644 "$here/jovie-hyperagent-bridge.service" "$HOME/.config/systemd/user/jovie-hyperagent-bridge.service"
systemctl --user daemon-reload
systemctl --user enable --now jovie-hyperagent-bridge.service
systemctl --user restart jovie-hyperagent-bridge.service
printf 'hyperagent bridge: %s\n' "$(systemctl --user is-active jovie-hyperagent-bridge.service)"
