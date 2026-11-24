#!/usr/bin/env bash
# Install the capacity collector as a systemd --user timer on Gem (every 15 min, no sudo, no secrets).
# Gem is also the cloud collector: it pulls GitHub rate, Doppler secret counts (names only) and the spend registry.
#   scripts/capacity/install-systemd-user.sh [--uninstall]
# Remediation (docker prune, allowlisted in the registry) is on: this host owns its own disk.
set -euo pipefail
U="$HOME/.config/systemd/user"; SHARE="$HOME/.local/share/capacity"; HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ "${1:-}" == "--uninstall" ]]; then
  systemctl --user disable --now capacity-collector.timer 2>/dev/null || true
  rm -f "$U/capacity-collector."{service,timer}; echo removed; exit 0
fi
mkdir -p "$U" "$SHARE/scripts/capacity" "$SHARE/ops/registry" "$SHARE/docs/design-system" "$HOME/.local/state/capacity"
install -m 0755 "$HERE/forecast.py" "$SHARE/scripts/capacity/forecast.py"
install -m 0644 "$HERE/collectors.py" "$SHARE/scripts/capacity/collectors.py"
# Waste loop rides this same timer (gem:waste-loop). Missing these made import waste fail
# into stderr since #23933 (2026-11-02) while forecast.json kept refreshing.
install -m 0644 "$HERE/waste.py" "$SHARE/scripts/capacity/waste.py"
install -m 0644 "$HERE/waste_debt.py" "$SHARE/scripts/capacity/waste_debt.py"
install -m 0644 "$HERE/../../ops/registry/capacity-resources.json" "$SHARE/ops/registry/capacity-resources.json"
install -m 0644 "$HERE/../../ops/registry/spend.json" "$SHARE/ops/registry/spend.json"
install -m 0644 "$HERE/../../ops/registry/waste.json" "$SHARE/ops/registry/waste.json"
install -m 0644 "$HERE/../../docs/design-system/cert-screens.json" "$SHARE/docs/design-system/cert-screens.json"
# The client layer (budgeted gh) the gh-rate and gh-env-secrets collectors import; without it they go BLIND.
mkdir -p "$SHARE/scripts/apiclient" "$SHARE/packages/api-client"
install -m 0644 "$HERE"/../apiclient/*.py "$SHARE/scripts/apiclient/"
install -m 0644 "$HERE/../../packages/api-client/providers.json" "$SHARE/packages/api-client/providers.json"
# Provenance, so drift between this install and main is visible in forecast.json.
git -C "$HERE" rev-parse HEAD >"$SHARE/INSTALLED_FROM" 2>/dev/null || echo unknown >"$SHARE/INSTALLED_FROM"
# CAPACITY_REPO points at the live lanes checkout so debt collectors can git-ls-files / read tip.
REPO_DEFAULT="${CAPACITY_REPO:-$HOME/devin-sweep/Jovie}"
cat >"$U/capacity-collector.service" <<UNIT
[Unit]
Description=Jovie capacity forecast collector
[Service]
Type=oneshot
Environment=CAPACITY_HOST=gem
Environment=CAPACITY_REPO=$REPO_DEFAULT
ExecStart=/usr/bin/python3 $SHARE/scripts/capacity/forecast.py collect --remediate
Nice=10
SuccessExitStatus=0 2
UNIT
cat >"$U/capacity-collector.timer" <<UNIT
[Unit]
Description=Jovie capacity forecast collector (15 min)
[Timer]
OnBootSec=2min
OnUnitActiveSec=15min
[Install]
WantedBy=timers.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now capacity-collector.timer
loginctl enable-linger "$USER" 2>/dev/null || true
systemctl --user list-timers capacity-collector.timer --no-pager | head -3
