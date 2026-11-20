#!/usr/bin/env bash
# Install the Hyperagent board bridge from this repo as a systemd user service on Gem.
#   bash scripts/hyperagent/install-board-bridge.sh
# Copies board_bridge.py into the bridge state dir (the token and run counters already live there)
# and points the unit at it. Idempotent. ROLLBACK: the previous script is kept as *.prev.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dest="$HOME/.jovie/mesh/hyperagent-bridge"
mkdir -p "$dest"
[ -f "$dest/hyperagent-bridge.py" ] && cp "$dest/hyperagent-bridge.py" "$dest/hyperagent-bridge.py.prev"
install -m 0755 "$here/board_bridge.py" "$dest/hyperagent-bridge.py"
if [ "$(uname -s)" = Darwin ]; then
  mkdir -p "$HOME/Library/LaunchAgents"
  plist="$HOME/Library/LaunchAgents/ie.jov.hyperagent-bridge.plist"
  sed "s|__HOME__|$HOME|g" "$here/ie.jov.hyperagent-bridge.plist.example" > "$plist"
  if launchctl print "gui/$(id -u)/ie.jov.hyperagent-bridge" >/dev/null 2>&1; then
    launchctl bootout "gui/$(id -u)/ie.jov.hyperagent-bridge"
  fi
  launchctl bootstrap "gui/$(id -u)" "$plist"
  launchctl print "gui/$(id -u)/ie.jov.hyperagent-bridge"
  exit
fi
mkdir -p "$HOME/.config/systemd/user"
install -m 0644 "$here/jovie-hyperagent-bridge.service" "$HOME/.config/systemd/user/jovie-hyperagent-bridge.service"
systemctl --user daemon-reload
systemctl --user enable --now jovie-hyperagent-bridge.service
systemctl --user restart jovie-hyperagent-bridge.service
printf 'hyperagent bridge: %s\n' "$(systemctl --user is-active jovie-hyperagent-bridge.service)"
