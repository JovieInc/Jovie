#!/usr/bin/env bash
# Install (or remove) the Pen golden-path archive sync as a per-user launchd job.
#
#   scripts/hostops/install-pen-golden-path-sync.sh            # install/refresh
#   scripts/hostops/install-pen-golden-path-sync.sh --uninstall
#
# Runs when the source .pen files are saved (WatchPaths) and hourly as a
# fallback for asset-only changes. The script is copied to
# ~/.local/share/pen-golden-path-sync/. Receipts:
# ~/.local/state/pen-golden-path-sync/{receipt.json,ledger.jsonl}.
# Kill switch: touch ~/.local/state/pen-golden-path-sync/disabled, or --uninstall.
set -euo pipefail

LABEL="co.jovie.ops.pen-golden-path-sync"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SHARE="$HOME/.local/share/pen-golden-path-sync"
STATE="$HOME/.local/state/pen-golden-path-sync"
WORKSPACE="$HOME/Documents/Jovie/Jovie Marketing Workspace"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pen-golden-path-sync.mjs"

if [[ "${1:-}" == "--uninstall" ]]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "removed $LABEL"
  exit 0
fi

mkdir -p "$SHARE" "$STATE" "$HOME/Library/LaunchAgents"
install -m 0755 "$SRC" "$SHARE/pen-golden-path-sync.mjs"

NODE="$(command -v node)"
NODE_DIR="$(dirname "$NODE")"
JOB_PATH="$NODE_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$SHARE/pen-golden-path-sync.mjs</string>
  </array>
  <key>WatchPaths</key>
  <array>
    <string>$WORKSPACE/Jovie Design Studio — canonical.lib.pen</string>
  </array>
  <key>ThrottleInterval</key><integer>300</integer>
  <key>StartInterval</key><integer>3600</integer>
  <key>RunAtLoad</key><true/>
  <key>LowPriorityIO</key><true/>
  <key>Nice</key><integer>10</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$JOB_PATH</string>
  </dict>
  <key>StandardOutPath</key><string>$STATE/launchd.log</string>
  <key>StandardErrorPath</key><string>$STATE/launchd.log</string>
</dict>
</plist>
PLIST

plutil -lint "$PLIST" >/dev/null
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed $LABEL; receipt: $STATE/receipt.json"
