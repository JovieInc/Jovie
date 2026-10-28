#!/usr/bin/env bash
# Install (or remove) the ops Mac disk guard as a per-user launchd job.
#
#   scripts/hostops/install-mac-disk-guard.sh            # install/refresh, every 15 min
#   scripts/hostops/install-mac-disk-guard.sh --uninstall
#
# The script is copied to ~/.local/share/mac-disk-guard/ so the job never runs
# from a worktree the guard itself might remove. Receipts:
# ~/.local/state/mac-disk-guard/{receipt.json,ledger.jsonl}.
# Kill switch: touch ~/.local/state/mac-disk-guard/disabled, or --uninstall.
set -euo pipefail

LABEL="co.jovie.ops.mac-disk-guard"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SHARE="$HOME/.local/share/mac-disk-guard"
STATE="$HOME/.local/state/mac-disk-guard"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/mac_disk_guard.py"

if [[ "${1:-}" == "--uninstall" ]]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "removed $LABEL"
  exit 0
fi

mkdir -p "$SHARE" "$STATE" "$HOME/Library/LaunchAgents"
install -m 0755 "$SRC" "$SHARE/mac_disk_guard.py"

# launchd starts with a bare PATH; carry the tools the sweep calls (git, lsof,
# xcrun, pnpm, osascript) from the installing shell.
PNPM_DIR="$(dirname "$(command -v pnpm 2>/dev/null || echo /usr/bin/true)")"
JOB_PATH="$PNPM_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>$SHARE/mac_disk_guard.py</string>
  </array>
  <key>StartInterval</key><integer>900</integer>
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
echo "installed $LABEL (every 15 min); receipt: $STATE/receipt.json"
