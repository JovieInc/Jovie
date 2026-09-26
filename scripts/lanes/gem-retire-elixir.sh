#!/usr/bin/env bash
# One-shot, run by Tim on Gem: make the lanes the only Symphony.
#   bash ~/devin-sweep/Jovie/scripts/lanes/gem-retire-elixir.sh
# 1. Stop and mask Symphony Elixir and its capacity/attestation/mirror units.
# 2. Put the lanes HUD on tty1 in place of the Symphony Elixir HUD.
# 3. Reclaim the Elixir workspaces (~160 GB) and old HUD builds.
# Idempotent; prints what it did. Nothing here touches the lanes' own state.
set -euo pipefail
say() { printf '%s\n' "$*"; }

say "== 1. Symphony Elixir units"
mkdir -p ~/.config/systemd/user/symphony-elixir.service.d
printf '[Unit]\nRefuseManualStop=no\n[Service]\nRestart=no\n' > ~/.config/systemd/user/symphony-elixir.service.d/retire.conf
systemctl --user daemon-reload
for unit in symphony-elixir.service symphony-capacity-chain.service gem-service-attestation.service jovie-git-mirror-refresh.timer jovie-git-mirror-refresh.service; do
  systemctl --user stop "$unit" 2>/dev/null || true
  systemctl --user disable "$unit" 2>/dev/null || true
done
systemctl --user mask symphony-elixir.service symphony-capacity-chain.service 2>/dev/null || true
sudo -n systemctl disable --now jovie-symphony-workspace-cleanup.timer 2>/dev/null || true
pkill -f 'symphony --i-understand-that-this-will-be-running-without-the-usual-guardrails' 2>/dev/null || true
say "   elixir: $(systemctl --user is-active symphony-elixir.service 2>/dev/null || true) / $(systemctl --user is-enabled symphony-elixir.service 2>/dev/null || true)"

say "== 2. HUD on tty1"
state="${LANES_STATE:-$HOME/.local/state/jovie-lanes}"
LANES_HUD=1 LANES_REPO="${LANES_REPO:-$HOME/devin-sweep/Jovie}" bash "$(dirname "$0")/install.sh"
systemctl --user disable --now gem-ship-hud.service 2>/dev/null || true
systemctl --user restart jovie-hud.service
say "   hud: $(systemctl --user is-active jovie-hud.service) on $(readlink "$state/current")"

say "== 3. Disk"
df -h / | tail -1
rm -rf ~/symphony-elixir-workspaces ~/symphony-elixir-logs ~/.local/share/gem-hud-builds 2>/dev/null || true
df -h / | tail -1
say "done. On the Mac, stop its lane copy with:"
say "  launchctl unload ~/Library/LaunchAgents/com.jovie.lanes.plist ~/Library/LaunchAgents/com.jovie.devin-sweep.plist; pkill -f 'lane_runner.py worker'"
