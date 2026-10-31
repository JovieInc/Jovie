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
# Stage the FULL runnable tree and swap it in on EVERY install. The old '[ -d current ] ||'
# guard skipped an existing current/, so a re-install never repaired a stale or mis-shaped tree
# and the units kept executing a dead path. prod_errors.py imports the shared scripts/apiclient
# layer (whose contract reads packages/api-client/providers.json two dirs up from itself), so
# the live tree ships the same repo-relative layout run.sh's self-update produces:
# current/scripts/{prod-errors,apiclient} + current/packages/api-client. Atomic swap: a failed
# stage never touches the live tree; the replaced tree is kept at current.prev for forensics.
root="$(cd "$here/../.." && pwd)"
# Serialize the stage+swap with run.sh's self-update: both stage through $base/next, and an
# install running mid-update must not pull the staging dir out from under a live update gate.
exec 9>"$base/.update.lock"
flock -w 120 9
rm -rf "$base/next" && mkdir -p "$base/next"
if git -C "$root" archive HEAD scripts/prod-errors scripts/apiclient packages/api-client 2>/dev/null | tar -x -C "$base/next"; then
  tree=""
  for p in scripts/prod-errors scripts/apiclient packages/api-client; do
    h="$(git -C "$root" rev-parse -q --verify "HEAD:$p" 2>/dev/null)" || h=""
    [ -n "$h" ] || { tree=""; break; }
    tree="$tree$h"
  done
else
  # No git metadata (installed from an extracted tree): copy the sibling trees directly.
  mkdir -p "$base/next/scripts" "$base/next/packages"
  cp -r "$root/scripts/prod-errors" "$root/scripts/apiclient" "$base/next/scripts/"
  cp -r "$root/packages/api-client" "$base/next/packages/"
fi
if [ -n "${tree:-}" ]; then printf '%s\n' "$tree" >"$base/next/.tree"; fi
# Fail closed: never swap an incomplete stage over a live tree (the exact incident class this
# installer repairs -- a current/ without a runnable prod_errors.py).
if [ ! -f "$base/next/scripts/prod-errors/prod_errors.py" ] ||
   [ ! -f "$base/next/scripts/apiclient/contract.py" ] ||
   [ ! -f "$base/next/packages/api-client/providers.json" ]; then
  echo "install: staged tree under $base/next is incomplete -- refusing to touch the live tree" >&2
  exit 1
fi
rm -rf "$base/current.prev"
[ ! -d "$base/current" ] || mv "$base/current" "$base/current.prev"
mv "$base/next" "$base/current"
flock -u 9
envf="$HOME/.config/jovie-prod-errors/env"
[ -f "$envf" ] || { umask 077; printf '# SENTRY_AUTH_TOKEN=\n# SENTRY_ORG=\n# SENTRY_WEBHOOK_SECRET=\n# SENTRY_SYNTHETIC_DSN=\n# PROD_ERRORS_ALERT_WEBHOOK=\n' >"$envf"; }
chmod 600 "$envf"
path="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
# bwrap: whole FS read-only, only the state dir + checkout writable, no ssh keys, no user bus.
# The apiclient budget ledger is host-wide (~/.local/state/jovie-lanes/api-ledger, shared with the
# lanes runtime and the TS client so every caller draws one budget) and is written on every API
# call, so the sandbox binds exactly that directory writable; the rest of the read-only root stays
# read-only. mkdir first: bwrap fails closed when a bind source does not exist.
ledger="$HOME/.local/state/jovie-lanes/api-ledger"
mkdir -p "$ledger"
sandbox="/usr/bin/bwrap --ro-bind / / --dev /dev --proc /proc --tmpfs /tmp --tmpfs $HOME/.ssh --bind $state $state --bind $base $base --bind $ledger $ledger --die-with-parent"
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
