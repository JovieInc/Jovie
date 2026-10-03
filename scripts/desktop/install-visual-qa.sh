#!/usr/bin/env bash
# Install the Mac visual QA LaunchAgent on a signed-in QA Mac. Idempotent.
# Every 15 minutes it checks whether Jovie Staging auto-updated to a new build;
# on a new build it waits for the user to be idle, walks the route list, diffs
# against the approved baseline, and files findings in Linear (mac-visual-qa).
#
#   VISUAL_QA_REPO=~/Jovie scripts/desktop/install-visual-qa.sh
#
# One-time grants: System Settings > Privacy & Security > Screen Recording for
# /bin/bash (screencapture -l needs it under launchd). LINEAR_API_KEY is read
# from $VISUAL_QA_LINEAR_ENV (default ~/.config/symphony/linear.env).
set -euo pipefail
[ "$(uname)" = "Darwin" ] || { echo "visual-qa: macOS only" >&2; exit 1; }

repo="${VISUAL_QA_REPO:-$HOME/Jovie}"
state="${VISUAL_QA_STATE:-$HOME/.local/state/jovie-mac-visual-qa}"
linear_env="${VISUAL_QA_LINEAR_ENV:-$HOME/.config/symphony/linear.env}"
path="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
plist="$HOME/Library/LaunchAgents/com.jovie.mac-visual-qa.plist"
tick="set -a; [ -f '$linear_env' ] && . '$linear_env'; set +a; cd '$repo' && exec node scripts/desktop/visual-qa.mjs --if-new-version --linear --state '$state'"

mkdir -p "$state"
cat >"$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.jovie.mac-visual-qa</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>-c</string><string>$tick</string></array>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$path</string>
  </dict>
  <key>StartInterval</key><integer>900</integer>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>$state/tick.log</string>
  <key>StandardErrorPath</key><string>$state/tick.log</string>
</dict></plist>
PLIST
launchctl unload "$plist" 2>/dev/null || true
launchctl load "$plist"
echo "visual-qa: installed $plist (logs: $state/tick.log)"
