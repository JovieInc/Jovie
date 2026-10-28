#!/usr/bin/env bash
# Install the prod-errors loop on Gem as user systemd units. Idempotent. Secrets live only in
# ~/.config/jovie-prod-errors/env (mode 600); this script never reads or prints them.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
base="$HOME/.local/share/jovie-prod-errors"
state="$HOME/.local/state/jovie-prod-errors"
units="$HOME/.config/systemd/user"
mkdir -p "$base" "$state" "$units" "$HOME/.config/jovie-prod-errors"
# Dead-man grace anchor: watchers get one full 2x-interval window counted from install before a
# missing heartbeat can alert. First install only -- re-installs keep the original anchor.
[ -f "$state/installed_at" ] || date +%s > "$state/installed_at"
install -m 755 "$here/run.sh" "$base/run.sh"
[ -d "$base/current" ] || { cp -r "$here" "$base/current"; }
envf="$HOME/.config/jovie-prod-errors/env"
[ -f "$envf" ] || { umask 077; printf '# SENTRY_AUTH_TOKEN=\n# SENTRY_ORG=\n# SENTRY_WEBHOOK_SECRET=\n# SENTRY_SYNTHETIC_DSN=\n# PROD_ERRORS_ALERT_WEBHOOK=\n' >"$envf"; }
chmod 600 "$envf"
path="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
# bwrap: whole FS read-only, only the state dir + checkout writable, no ssh keys, no user bus.
sandbox="/usr/bin/bwrap --ro-bind / / --dev /dev --proc /proc --tmpfs /tmp --tmpfs $HOME/.ssh --bind $state $state --bind $base $base --die-with-parent"
unit() { # name description schedule command
  cat >"$units/jovie-prod-errors-$1.service" <<UNIT
[Unit]
Description=Jovie prod-errors: $2
[Service]
Type=oneshot
Environment=PATH=$path
Environment=PROD_ERRORS_STATE=$state
Environment=LANES_LINEAR_ENV=$HOME/.config/symphony/linear.env
UnsetEnvironment=DBUS_SESSION_BUS_ADDRESS
ExecStart=$sandbox /bin/bash $base/run.sh $4
CPUQuota=100%
MemoryMax=1G
Nice=10
RuntimeMaxSec=600
UNIT
  cat >"$units/jovie-prod-errors-$1.timer" <<UNIT
[Unit]
Description=Jovie prod-errors: $2
[Timer]
OnCalendar=$3
Persistent=true
RandomizedDelaySec=60
[Install]
WantedBy=timers.target
UNIT
}
unit sweep "Sentry 30-min sweep + post-deploy verifier" "*:0/30" sweep
unit ci-main "CI/canary/E2E/a11y watcher on main" "*:5/15" ci-main
unit deadman "independent dead-man (heartbeats, error streaks, synthetic loop)" "*:10/15" deadman
unit synthetic "weekly synthetic error through the whole loop" "Mon *-*-* 17:00:00" synthetic
cat >"$units/jovie-prod-errors-receiver.service" <<UNIT
[Unit]
Description=Jovie prod-errors: Sentry webhook receiver (127.0.0.1:8788; expose via tailscale funnel)
[Service]
Environment=PATH=$path
Environment=PROD_ERRORS_STATE=$state
ExecStart=/bin/bash $base/run.sh receive --port 8788
Restart=on-failure
RestartSec=300
MemoryMax=256M
[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
for t in sweep ci-main deadman synthetic; do systemctl --user enable --now "jovie-prod-errors-$t.timer"; done
systemctl --user enable --now jovie-prod-errors-receiver.service
systemctl --user list-timers 'jovie-prod-errors-*' --no-pager
