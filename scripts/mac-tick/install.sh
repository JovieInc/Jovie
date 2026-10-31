#!/usr/bin/env bash
# Install (or remove) the one Mac launchd agent that runs every periodic Mac job.
#
#   CAPACITY_HOST=mac scripts/mac-tick/install.sh      # Tim's Mac (air for the Air)
#   scripts/mac-tick/install.sh --uninstall
# Replaces co.jovie.ops.mac-disk-guard and co.jovie.ops.capacity-collector (booted out here).
# Kill switch: touch ~/.local/state/mac-tick/disabled, or --uninstall.
set -euo pipefail
LABEL="co.jovie.ops.tick"
LEGACY=("co.jovie.ops.mac-disk-guard" "co.jovie.ops.capacity-collector")
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SHARE="$HOME/.local/share"
STATE="$HOME/.local/state/mac-tick"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$HERE/../.."
if [[ "${1:-}" == "--uninstall" ]]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true; rm -f "$PLIST"; echo "removed $LABEL"; exit 0
fi
HOST="${CAPACITY_HOST:?set CAPACITY_HOST=mac or air}"
mkdir -p "$SHARE/mac-tick" "$SHARE/mac-disk-guard" "$SHARE/capacity/scripts/capacity" "$SHARE/capacity/ops/registry" "$STATE" "$HOME/Library/LaunchAgents"
install -m 0755 "$HERE/mac_tick.py" "$SHARE/mac-tick/mac_tick.py"
install -m 0644 "$HERE/tasks.json" "$SHARE/mac-tick/tasks.json"
install -m 0755 "$ROOT/scripts/hostops/mac_disk_guard.py" "$SHARE/mac-disk-guard/mac_disk_guard.py"
install -m 0755 "$ROOT/scripts/capacity/forecast.py" "$SHARE/capacity/scripts/capacity/forecast.py"
install -m 0644 "$ROOT/ops/registry/capacity-resources.json" "$SHARE/capacity/ops/registry/capacity-resources.json"
install -m 0644 "$ROOT/ops/registry/spend.json" "$SHARE/capacity/ops/registry/spend.json"
PNPM_DIR="$(dirname "$(command -v pnpm 2>/dev/null || echo /usr/bin/true)")"
cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/usr/bin/python3</string><string>$SHARE/mac-tick/mac_tick.py</string></array>
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><true/>
  <key>Nice</key><integer>10</integer>
  <key>LowPriorityIO</key><true/>
  <key>EnvironmentVariables</key><dict>
    <key>CAPACITY_HOST</key><string>$HOST</string>
    <key>PATH</key><string>$PNPM_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>StandardOutPath</key><string>$STATE/launchd.log</string>
  <key>StandardErrorPath</key><string>$STATE/launchd.log</string>
</dict></plist>
PLIST
plutil -lint "$PLIST" >/dev/null
for old in "${LEGACY[@]}"; do
  launchctl bootout "gui/$(id -u)/$old" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/$old.plist"
done
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed $LABEL (host=$HOST); receipt: $STATE/receipt.json"
