#!/usr/bin/env bash
# Install the Mac launchd job for scripts/tooling-health.mjs (every 5 min).
# Re-run from a stable checkout after merge to repoint it. Secrets are sourced from ~/.hermes/.env at run time, never written here.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE="${NODE_BIN:-$HOME/.nvm/versions/node/v24.21.0/bin/node}"
LABEL=co.jovie.tooling-health
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
mkdir -p "$HOME/.jovie/tooling-health"
cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>$LABEL</string>
<key>ProgramArguments</key><array><string>/bin/zsh</string><string>-c</string>
<string>[ -r "\$HOME/.hermes/.env" ] &amp;&amp; { set -a; . "\$HOME/.hermes/.env"; set +a; }; exec "$NODE" "$ROOT/scripts/tooling-health.mjs"</string></array>
<key>StartInterval</key><integer>300</integer>
<key>RunAtLoad</key><true/>
<key>StandardOutPath</key><string>$HOME/.jovie/tooling-health/launchd.log</string>
<key>StandardErrorPath</key><string>$HOME/.jovie/tooling-health/launchd.log</string>
</dict></plist>
EOF
launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$PLIST"
echo "installed $LABEL -> $ROOT"
