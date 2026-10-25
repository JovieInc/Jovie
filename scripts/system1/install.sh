#!/usr/bin/env bash
# Install the weekly System-1 tuning timer on Gem (systemd --user).
#   scripts/system1/install.sh [--uninstall]
# The service runs from a dedicated detached worktree that tracks origin/main, so a
# merged change takes effect on the next run without a deploy step. Optional
# credentials (AI_GATEWAY_API_KEY, CLOUDFLARE_WORKERS_AI_TOKEN) go in
# ~/.config/jovie-system1/env (mode 600); without them the job still joins
# outcomes, writes the report and tunes offline, and skips model replays.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
unit_dir="${HOME}/.config/systemd/user"
main_wt=/srv/worktrees/codex-worktrees/system1-main
if [ "${1:-}" = "--uninstall" ]; then
  systemctl --user disable --now jovie-system1-weekly.timer || true
  rm -f "${unit_dir}/jovie-system1-weekly.service" "${unit_dir}/jovie-system1-weekly.timer"
  systemctl --user daemon-reload
  exit 0
fi
if [ ! -e "${main_wt}/.git" ]; then
  repo="$(git -C "${here}" rev-parse --show-toplevel)"
  git -C "${repo}" fetch -q origin main
  git -C "${repo}" worktree add --detach "${main_wt}" origin/main
fi
mkdir -p "${unit_dir}" "${HOME}/.config/jovie-system1"
install -m 644 "${here}/jovie-system1-weekly.service" "${here}/jovie-system1-weekly.timer" "${unit_dir}/"
systemctl --user daemon-reload
systemctl --user enable --now jovie-system1-weekly.timer
systemctl --user list-timers jovie-system1-weekly.timer --no-pager
