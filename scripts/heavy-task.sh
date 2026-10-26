#!/usr/bin/env bash
# Host-wide heavy-task semaphore: at most HEAVY_TASK_SLOTS (default 3) tsc / vitest / eslint / lint-staged
# style runs at once on a shared machine, each at nice 10. Gem hit load 43 on 16 cores (2026-10-26) because
# lanes, agents and hooks each started their own. Waiters block on a slot (flock), never spin.
# Usage: bash scripts/heavy-task.sh <command> [args...]
# Hosted CI runners (CI set) and HEAVY_TASK_DISABLE=1 run the command directly.
set -uo pipefail
if [[ -n "${CI:-}" || "${HEAVY_TASK_DISABLE:-}" == "1" || $# -eq 0 ]]; then exec "$@"; fi
slots="${HEAVY_TASK_SLOTS:-3}"
dir="${HEAVY_TASK_DIR:-${XDG_RUNTIME_DIR:-/tmp}/jovie-heavy-task-$(id -u)}"
mkdir -p "$dir" 2>/dev/null || exec nice -n 10 "$@"
if ! command -v flock >/dev/null 2>&1; then exec nice -n 10 "$@"; fi
# Take the first free slot without waiting; otherwise block on a rotating slot so waiters spread out.
for ((i = 1; i <= slots; i++)); do
  exec {fd}>"$dir/slot-$i" || continue
  if flock -n "$fd"; then
    export HEAVY_TASK_HELD=1
    exec nice -n 10 "$@"   # the fd (and the lock) is inherited by the command and freed when it exits
  fi
  exec {fd}>&-
done
pick=$(( (RANDOM % slots) + 1 ))
exec {fd}>"$dir/slot-$pick" && flock "$fd"
exec nice -n 10 "$@"
