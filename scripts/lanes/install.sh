#!/usr/bin/env bash
# Install the Jovie shipping lanes on this host (Gem: systemd user timer; macOS: launchd).
# Idempotent. The timer runs `update` (drain-safe self-update from origin/main) then
# `dispatch` every 5 minutes; workers pull the next issue (and lane-fix-labeled PRs) themselves
# as slots free up, so the tick is only the idle fallback. 5 minutes, not more: the doctor's
# status feed rides this tick and its consumers call it stale after 10 minutes. Each tick costs
# ~6-14 GitHub reads; minutely ticks ran back to back (~19/h) for no new work.
#   LANES_REPO=~/devin-sweep/Jovie scripts/lanes/install.sh
set -euo pipefail
state="${LANES_STATE:-$HOME/.local/state/jovie-lanes}"
repo="${LANES_REPO:-$HOME/devin-sweep/Jovie}"
ledger_cadence=3600
here="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$state"
LANES_STATE="$state" LANES_REPO="$repo" python3 "$here/lane_runner.py" update
tick="python3 $state/current/lane_runner.py update; python3 $state/current/codex_lane.py reconcile --if-due $ledger_cadence; exec python3 $state/current/lane_runner.py dispatch"
watchdog="exec python3 $state/current/factory_watchdog.py"
# Pin timers to the Node selected by the installing shell.
node_dir="$(dirname "$(command -v node)")"
path="$node_dir:$HOME/.local/bin:$HOME/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
# Preserve the installed brain CLI for detached reason/corpus workers. A login
# shell may resolve it outside standard CLI directories (for example ~/.hermes/bin).
# Discover the executable; do not copy credentials or activate another runtime.
if brain_command="$(command -v gbrain)" && [[ "$brain_command" = /* ]]; then
  brain_dir="$(dirname "$brain_command")"
  case ":$path:" in
    *":$brain_dir:"*) ;;
    *) path="$path:$brain_dir" ;;
  esac
fi
source_tree="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["objects"]["scripts/lanes"])' "$state/current/.release.json")"
source_commit="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["sourceCommit"])' "$state/current/.release.json")"
LANES_STATE="$state" python3 "$state/current/codex_lane.py" install-receipt \
  --source-commit "$source_commit" --source-tree "$source_tree" --platform "$(uname)" --cadence "$ledger_cadence" >/dev/null

if [ "$(uname)" = "Darwin" ]; then
  plist="$HOME/Library/LaunchAgents/com.jovie.lanes.plist"
  watchdog_plist="$HOME/Library/LaunchAgents/com.jovie.lanes-watchdog.plist"
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
    <key>CODEX_LEDGER_CADENCE_S</key><string>$ledger_cadence</string>
    <key>LANES_LINEAR_ENV</key><string>${LANES_LINEAR_ENV:-$HOME/.config/symphony/linear.env}</string>
  </dict>
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$state/tick.log</string>
  <key>StandardErrorPath</key><string>$state/tick.log</string>
</dict></plist>
PLIST
  cat >"$watchdog_plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.jovie.lanes-watchdog</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>-c</string><string>$watchdog</string></array>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$path</string>
    <key>LANES_STATE</key><string>$state</string>
    <key>LANES_REPO</key><string>$repo</string>
    <key>LANES_LINEAR_ENV</key><string>${LANES_LINEAR_ENV:-$HOME/.config/symphony/linear.env}</string>
  </dict>
  <key>StartInterval</key><integer>60</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$state/watchdog.log</string>
  <key>StandardErrorPath</key><string>$state/watchdog.log</string>
</dict></plist>
PLIST
  launchctl unload "$plist" 2>/dev/null || true
  launchctl unload "$watchdog_plist" 2>/dev/null || true
  launchctl load "$plist"
  launchctl load "$watchdog_plist"
else
  units="$HOME/.config/systemd/user"
  mkdir -p "$units"
  # Keep scanner clones and validation temporaries on the operator-selected volume.
  # Unset leaves existing placement intact; never chmod a shared temporary root.
  if [ -n "${LANES_TMPDIR:-}" ]; then
    temp_dir="$(python3 -c '
import os, pathlib, sys
value = sys.argv[1]
path = pathlib.Path(value)
if not path.is_absolute() or any(c in value for c in ("\"", "\\", "%", "\n", "\r", "\0")):
    raise SystemExit("LANES_TMPDIR must be an absolute, unit-safe path")
if not path.exists():
    path.mkdir(mode=0o700, parents=True)
info = path.lstat()
if path.is_symlink() or not path.is_dir() or info.st_uid != os.getuid() or info.st_mode & 0o7777 != 0o700:
    raise SystemExit("LANES_TMPDIR must be a private mode-700 directory owned by the installing user")
print(path)
' "$LANES_TMPDIR")"
    for lane_unit in jovie-lanes jovie-lanes-watchdog jovie-lanes-wake; do
      mkdir -p "$units/$lane_unit.service.d"
      cat >"$units/$lane_unit.service.d/65-temp-placement.conf" <<UNIT
[Service]
# Managed by scripts/lanes/install.sh with LANES_TMPDIR.
Environment="TMPDIR=$temp_dir"
UNIT
    done
  fi
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
Environment=CODEX_LEDGER_CADENCE_S=$ledger_cadence
Environment=LANES_LINEAR_ENV=${LANES_LINEAR_ENV:-$HOME/.config/symphony/linear.env}
ExecStart=/bin/bash -c '$tick'
UNIT
  cat >"$units/jovie-lanes.timer" <<UNIT
[Unit]
Description=Idle fallback for Jovie shipping lanes (busy slots pull work themselves)
[Timer]
OnCalendar=*:0/5
Persistent=true
[Install]
WantedBy=timers.target
UNIT
  cat >"$units/jovie-lanes-watchdog.service" <<UNIT
[Unit]
Description=Jovie shipping lanes independent stay-up watchdog
[Service]
Type=oneshot
Environment=PATH=$path
Environment=LANES_STATE=$state
Environment=LANES_REPO=$repo
Environment=LANES_LINEAR_ENV=${LANES_LINEAR_ENV:-$HOME/.config/symphony/linear.env}
ExecStart=/bin/bash -c '$watchdog'
UNIT
  cat >"$units/jovie-lanes-watchdog.timer" <<UNIT
[Unit]
Description=Verify and recover Jovie shipping lanes every minute
[Timer]
OnActiveSec=15s
OnUnitActiveSec=60s
# A wall-clock trigger too: a stopped or failed oneshot chain must never silence the dead-man.
OnCalendar=minutely
Persistent=true
[Install]
WantedBy=timers.target
UNIT
  # JOV-8931: the lane-fix relay's gem-side job drops a wake file when a red CI
  # event lands; this path unit runs `fix-now` the moment one appears, so a
  # worker starts in seconds instead of waiting for the 5-minute timer.
  mkdir -p "$state/wake"
  cat >"$units/jovie-lanes-wake.service" <<UNIT
[Unit]
Description=Jovie shipping lanes: fix-now on a relayed red CI event (JOV-8931)
[Service]
Type=oneshot
KillMode=process
Environment=PATH=$path
Environment=LANES_STATE=$state
Environment=LANES_REPO=$repo
Environment=CODEX_LEDGER_CADENCE_S=$ledger_cadence
Environment=LANES_LINEAR_ENV=${LANES_LINEAR_ENV:-$HOME/.config/symphony/linear.env}
ExecStart=/bin/bash -c 'exec python3 $state/current/lane_runner.py fix-now'
UNIT
  cat >"$units/jovie-lanes-wake.path" <<UNIT
[Unit]
Description=Watch the lane-fix relay's red wake dir (JOV-8931)
[Path]
PathChanged=$state/wake
Unit=jovie-lanes-wake.service
[Install]
WantedBy=default.target
UNIT
  # Wake repairs must inherit the same subscription/provider and resource
  # policy as normal lanes. Share only declarative Service drop-ins, never a
  # main-unit command override; preserve source order and operator-owned files.
  python3 -c '
import os, pathlib, re, sys
units = pathlib.Path(sys.argv[1])
main = units / "jovie-lanes.service.d"
wake = units / "jovie-lanes-wake.service.d"
allowed = {"Environment", "EnvironmentFile", "UnsetEnvironment", "Slice", "Nice",
           "CPUWeight", "CPUQuota", "MemoryHigh", "MemoryMax", "MemorySwapMax", "TasksMax"}
sources = sorted(main.glob("*.conf"))
simple_escapes = dict(zip("abfnrtv", map(chr, (7, 8, 12, 10, 13, 9, 11))))
simple_escapes.update({"s": " ", chr(92): chr(92), chr(34): chr(34), chr(39): chr(39)})
def unescape(match):
    token = match.group(1)
    if token in simple_escapes:
        return simple_escapes[token]
    if token[0] in "xuU" and len(token) > 1:
        point = int(token[1:], 16)
    elif len(token) == 3 and all(c in "01234567" for c in token):
        point = int(token, 8)
    else:
        raise SystemExit("Unsupported escape in shared lane policy")
    if point == 0 or point > 0x10ffff or 0xd800 <= point <= 0xdfff:
        raise SystemExit("Invalid character in shared lane policy")
    return chr(point)
for source in sources:
    section = None
    for raw in source.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith(("#", ";")):
            continue
        if line.startswith("[") and line.endswith("]"):
            section = line[1:-1]
            if section != "Service":
                raise SystemExit("Cannot share non-Service lane policy: " + str(source))
            continue
        if section != "Service" or "=" not in line or line.split("=", 1)[0].strip() not in allowed:
            raise SystemExit("Cannot share executable or unsupported lane policy: " + str(source))
        directive, value = line.split("=", 1)
        if directive.strip() in ("Environment", "EnvironmentFile", "UnsetEnvironment", "Slice"):
            decoded = re.sub(r"\\(x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8}|[0-7]{3}|.)", unescape, value)
            if any(match.group(1) not in ("%", "h", "u", "U", "t", "H", "m") for match in re.finditer(r"%(.)?", decoded)):
                raise SystemExit("Cannot share a unit-specific lane policy specifier: " + str(source))
wake.mkdir(parents=True, exist_ok=True)
if wake.is_symlink():
    raise SystemExit("Wake policy directory must not be a symlink")
active = {"50-main-" + source.name: source for source in sources}
for link in wake.glob("50-main-*.conf"):
    expected = main / link.name.removeprefix("50-main-")
    if not link.is_symlink() or os.readlink(link) != str(expected):
        raise SystemExit("Refusing to replace operator-owned wake policy: " + str(link))
for name, source in active.items():
    link = wake / name
    if not link.is_symlink():
        link.symlink_to(source)
for link in wake.glob("50-main-*.conf"):
    if link.name not in active:
        link.unlink()
' "$units"
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
  systemctl --user enable --now jovie-lanes-watchdog.timer
  systemctl --user enable --now jovie-lanes-wake.path
  if [ "${LANES_HUD:-0}" = "1" ]; then
    systemctl --user enable jovie-hud.service
    touch "$state/hud.expected"   # the doctor raises hud-stale when the console stops updating
  fi
fi
echo "lanes installed: $(readlink "$state/current")"
