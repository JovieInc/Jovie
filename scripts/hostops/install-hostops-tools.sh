#!/usr/bin/env bash
# Install the fleet host tools from this checkout onto the current machine.
#
#   scripts/hostops/install-hostops-tools.sh             # install/refresh
#   scripts/hostops/install-hostops-tools.sh --uninstall
#
# Installs, each copied from the repo and recorded (sha256) in
# ~/.local/state/jovie-hostops/installed.json so the loose-exec guard can tell
# a reviewed install from a hand edit:
#   - codex launcher   -> ~/.local/share/jovie-hostops/bin/codex, linked as ~/.local/bin/codex
#   - loose-exec guard -> ~/.local/share/jovie-hostops/bin/loose_exec_guard.py, run daily
#     (launchd co.jovie.ops.loose-exec-guard on macOS, systemd user timer on Linux).
# Guard receipts: ~/.local/state/loose-exec-guard/{report.json,ledger.jsonl}.
# Copies, not symlinks into a worktree: worktrees get cleaned up.
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARE="$HOME/.local/share/jovie-hostops/bin"
STATE="$HOME/.local/state/loose-exec-guard"
LABEL="co.jovie.ops.loose-exec-guard"
GUARD="$SHARE/loose_exec_guard.py"

uninstall() {
  if [[ "$(uname -s)" == Darwin ]]; then
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
  else
    systemctl --user disable --now loose-exec-guard.timer 2>/dev/null || true
    rm -f "$HOME/.config/systemd/user/loose-exec-guard."{service,timer}
    systemctl --user daemon-reload 2>/dev/null || true
  fi
  [[ "$(readlink "$HOME/.local/bin/codex" 2>/dev/null)" == "$SHARE/codex" ]] && rm -f "$HOME/.local/bin/codex"
  echo "removed hostops tools"
}

if [[ "${1:-}" == "--uninstall" ]]; then
  uninstall
  exit 0
fi

mkdir -p "$SHARE" "$STATE" "$HOME/.local/bin"
install -m 0755 "$SRC_DIR/codex-launcher.sh" "$SHARE/codex"
install -m 0755 "$SRC_DIR/loose_exec_guard.py" "$GUARD"
ln -sfn "$SHARE/codex" "$HOME/.local/bin/codex"
python3 "$GUARD" record "$SHARE/codex" scripts/hostops/codex-launcher.sh
python3 "$GUARD" record "$GUARD" scripts/hostops/loose_exec_guard.py

JOB_PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
if [[ "$(uname -s)" == Darwin ]]; then
  PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
  mkdir -p "$(dirname "$PLIST")"
  cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>$GUARD</string>
    <string>scan</string>
    <string>--report</string>
    <string>$STATE/report.json</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$JOB_PATH</string></dict>
  <key>StartInterval</key><integer>86400</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardErrorPath</key><string>$STATE/stderr.log</string>
</dict>
</plist>
PLIST
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
else
  UNIT_DIR="$HOME/.config/systemd/user"
  mkdir -p "$UNIT_DIR"
  cat >"$UNIT_DIR/loose-exec-guard.service" <<UNIT
[Unit]
Description=Jovie loose-exec guard (flags jobs that run files outside CI-tracked repos)

[Service]
Type=oneshot
Environment=PATH=$JOB_PATH
ExecStart=/usr/bin/python3 $GUARD scan --report $STATE/report.json
UNIT
  cat >"$UNIT_DIR/loose-exec-guard.timer" <<UNIT
[Unit]
Description=Daily loose-exec guard scan

[Timer]
OnBootSec=10min
OnUnitActiveSec=1d
Persistent=true

[Install]
WantedBy=timers.target
UNIT
  systemctl --user daemon-reload
  systemctl --user enable --now loose-exec-guard.timer
fi
echo "installed codex launcher ($HOME/.local/bin/codex) and $LABEL; report: $STATE/report.json"
