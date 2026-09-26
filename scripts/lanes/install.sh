#!/usr/bin/env bash
# Install the Jovie shipping lanes on this host (Gem: systemd user timer; macOS: launchd).
# Idempotent. The timer runs `update` (drain-safe self-update from origin/main) then
# `dispatch` every minute; workers pull the next issue themselves as slots free up.
#   LANES_REPO=~/devin-sweep/Jovie scripts/lanes/install.sh
set -euo pipefail
state="${LANES_STATE:-$HOME/.local/state/jovie-lanes}"
repo="${LANES_REPO:-$HOME/devin-sweep/Jovie}"
here="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$state"
LANES_STATE="$state" LANES_REPO="$repo" python3 "$here/lane_runner.py" update
tick="python3 $state/current/lane_runner.py update; exec python3 $state/current/lane_runner.py dispatch"
path="$HOME/.local/bin:$HOME/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

if [ "$(uname)" = "Darwin" ]; then
  plist="$HOME/Library/LaunchAgents/com.jovie.lanes.plist"
  cat >"$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.jovie.lanes</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>-c</string><string>$tick</string></array>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$path</string>
    <key>LANES_STATE</key><string>$state</string>
    <key>LANES_REPO</key><string>$repo</string>
    <key>LANES_LINEAR_ENV</key><string>${LANES_LINEAR_ENV:-$HOME/.config/symphony/linear.env}</string>
  </dict>
  <key>StartInterval</key><integer>60</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$state/tick.log</string>
  <key>StandardErrorPath</key><string>$state/tick.log</string>
</dict></plist>
PLIST
  launchctl unload "$plist" 2>/dev/null || true
  launchctl load "$plist"
else
  units="$HOME/.config/systemd/user"
  mkdir -p "$units"
  cat >"$units/jovie-lanes.service" <<UNIT
[Unit]
Description=Jovie shipping lanes: drain-safe update, then dispatch free slots
[Service]
Type=oneshot
# Workers are detached sessions; stopping this unit must never kill in-flight work.
KillMode=process
Environment=PATH=$path
Environment=LANES_STATE=$state
Environment=LANES_REPO=$repo
Environment=LANES_LINEAR_ENV=${LANES_LINEAR_ENV:-$HOME/.config/symphony/linear.env}
ExecStart=/bin/bash -c '$tick'
UNIT
  cat >"$units/jovie-lanes.timer" <<UNIT
[Unit]
Description=Idle fallback for Jovie shipping lanes (busy slots pull work themselves)
[Timer]
OnCalendar=minutely
Persistent=true
[Install]
WantedBy=timers.target
UNIT
  if [ "${LANES_HUD:-0}" = "1" ]; then
    # The console HUD (tty1). Font and sudo setfont mirror the retired Symphony Elixir HUD unit.
    font="$HOME/.local/state/gem-checkin-hud/fonts/hud-symbols.psf"
    cat >"$units/jovie-hud.service" <<UNIT
[Unit]
Description=Symphony lanes HUD on tty1
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
Environment=PATH=$path
Environment=LANES_STATE=$state
Environment=LANES_REPO=$repo
Environment=LANES_LINEAR_ENV=${LANES_LINEAR_ENV:-$HOME/.config/symphony/linear.env}
Environment=PYTHONUNBUFFERED=1
Environment=TERM=linux
Environment=LANG=en_US.UTF-8
Environment=LC_ALL=en_US.UTF-8
UnsetEnvironment=COLUMNS LINES
$( [ -f "$font" ] && printf 'ExecStartPre=-/usr/bin/sudo -n /usr/bin/setfont -C /dev/tty1 %s\n' "$font" )
ExecStart=/bin/bash $state/current/hud-tty1.sh
Restart=always
RestartSec=2
StandardInput=null
StandardOutput=tty
StandardError=journal
TTYPath=/dev/tty1
TTYReset=yes
TTYVHangup=no
TTYVTDisallocate=yes
[Install]
WantedBy=default.target
UNIT
  fi
  systemctl --user daemon-reload
  systemctl --user enable --now jovie-lanes.timer
  if [ "${LANES_HUD:-0}" = "1" ]; then
    systemctl --user enable jovie-hud.service
  fi
fi
echo "lanes installed: $(readlink "$state/current")"
