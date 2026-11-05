#!/usr/bin/env bash
# Process containment for agent work on Gem (incident 2026-11-01: a recursing preflight put the host at
# load 1,661 with 194 copies and 1,293 defunct processes; runners, sshd and every agent stalled).
#
# Installs two systemd --user slices and an `agent-run` wrapper (no sudo, reversible):
#   agent-preflight.slice  TasksMax=512   CPUWeight=25   preflight:remote jobs (scripts/preflight-remote.mjs)
#   agent-lanes.slice      TasksMax=1024  CPUWeight=20   jovie-lanes.service and its workers (measured: ~160 tasks)
# When a slice hits TasksMax, fork() fails inside it (EAGAIN): the storm stops there, outside the slices
# (GitHub runners in system.slice / ci-runners.slice, sshd, the capacity timers) keep running.
#
#   scripts/capacity/install-agent-slices.sh [--uninstall|--status]
#   agent-run preflight|lanes <command...>     run a command inside the slice (falls back to a plain exec)
set -euo pipefail
U="$HOME/.config/systemd/user"; BIN="$HOME/.local/bin"
case "${1:-install}" in
  --uninstall)
    rm -f "$U/agent-preflight.slice" "$U/agent-lanes.slice" "$U/jovie-lanes.service.d/05-agent-slice.conf" "$BIN/agent-run"
    systemctl --user daemon-reload; echo "removed agent slices"; exit 0 ;;
  --status)
    systemctl --user show agent-preflight.slice agent-lanes.slice -p Id -p TasksMax -p CPUWeight -p TasksCurrent
    exit 0 ;;
esac
mkdir -p "$U/jovie-lanes.service.d" "$BIN"
cat >"$U/agent-preflight.slice" <<UNIT
[Unit]
Description=Agent preflight jobs (fork-storm containment)
[Slice]
TasksMax=512
CPUWeight=25
UNIT
cat >"$U/agent-lanes.slice" <<UNIT
[Unit]
Description=Shipping lane workers (fork-storm containment)
[Slice]
TasksMax=1024
CPUWeight=20
UNIT
cat >"$U/jovie-lanes.service.d/05-agent-slice.conf" <<UNIT
[Service]
# Workers inherit the slice. UNDO: scripts/capacity/install-agent-slices.sh --uninstall
Slice=agent-lanes.slice
UNIT
cat >"$BIN/agent-run" <<'WRAP'
#!/usr/bin/env bash
# agent-run preflight|lanes <command...>: run inside agent-<name>.slice; plain exec if the slice is not installed.
set -u
name="${1:?usage: agent-run preflight|lanes <command...>}"; shift
if [ -f "$HOME/.config/systemd/user/agent-$name.slice" ] && command -v systemd-run >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
  exec systemd-run --user --scope --quiet --collect --slice="agent-$name.slice" -- "$@"
fi
exec "$@"
WRAP
chmod 0755 "$BIN/agent-run"
systemctl --user daemon-reload
systemctl --user show agent-preflight.slice agent-lanes.slice -p Id -p TasksMax -p CPUWeight
echo "installed. Lanes pick up the slice on their next run; verify with --status."
