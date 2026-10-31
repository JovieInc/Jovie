#!/usr/bin/env bash
# Install (or remove) the capacity collector as a per-user launchd agent on the Mac or the Air.
# No secrets, no sudo. Samples disk and inodes every 30 min and writes alarms to the local feed.
#
#   CAPACITY_HOST=mac scripts/capacity/install-launchd.sh        # Tim's Mac
#   CAPACITY_HOST=air scripts/capacity/install-launchd.sh        # MacBook Air
#   scripts/capacity/install-launchd.sh --uninstall
# Kill switch: touch ~/.local/state/capacity/disabled, or --uninstall.
set -euo pipefail
# Superseded 2026-10-31: every periodic Mac job runs from the one co.jovie.ops.tick agent.
if [[ "${1:-}" != "--uninstall" ]]; then
  echo "note: capacity collector now installs via scripts/mac-tick/install.sh" >&2
  exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../mac-tick/install.sh"
fi
LABEL="co.jovie.ops.capacity-collector"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SHARE="$HOME/.local/share/capacity"
STATE="$HOME/.local/state/capacity"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ "${1:-}" == "--uninstall" ]]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true; rm -f "$PLIST"; echo "removed $LABEL"; exit 0
fi
HOST="${CAPACITY_HOST:?set CAPACITY_HOST=mac or air}"
mkdir -p "$SHARE/scripts/capacity" "$SHARE/ops/registry" "$STATE" "$HOME/Library/LaunchAgents"
install -m 0755 "$HERE/forecast.py" "$SHARE/scripts/capacity/forecast.py"
install -m 0644 "$HERE/../../ops/registry/capacity-resources.json" "$SHARE/ops/registry/capacity-resources.json"
install -m 0644 "$HERE/../../ops/registry/spend.json" "$SHARE/ops/registry/spend.json"
cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>/bin/sh</string><string>-c</string>
    <string>[ -e "$STATE/disabled" ] || /usr/bin/python3 "$SHARE/scripts/capacity/forecast.py" collect</string>
  </array>
  <key>StartInterval</key><integer>1800</integer>
  <key>RunAtLoad</key><true/>
  <key>Nice</key><integer>10</integer>
  <key>LowPriorityIO</key><true/>
  <key>EnvironmentVariables</key><dict>
    <key>CAPACITY_HOST</key><string>$HOST</string>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StandardErrorPath</key><string>$STATE/collector.err</string>
</dict></plist>
PLIST
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed $LABEL for host=$HOST; samples: $STATE/samples.jsonl"
