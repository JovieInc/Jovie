#!/usr/bin/env bash
# Continuous loop: drain PRs + trains every N seconds until 0 open PRs and 0 todos.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
INTERVAL="${LOOP_INTERVAL:-300}"
LOG="$ROOT/.context/loop-logs"
mkdir -p "$LOG"
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG/orchestrator.log"; }
open_prs() { gh pr list --state open --json number --jq 'length' 2>/dev/null || echo 999; }
eligible_todos() {
  if [[ ! -f "$ROOT/scripts/github-query-todo.mjs" ]]; then echo 999; return; fi
  local output
  if ! output="$(doppler run --project jovie-web --config dev -- node "$ROOT/scripts/github-query-todo.mjs" 2>/dev/null)"; then
    echo 999
    return
  fi
  if [[ -z "$output" ]]; then
    echo 0
    return
  fi
  printf '%s\n' "$output" | wc -l | tr -d ' '
}
log "orchestrator start interval=${INTERVAL}s pid=$$"
while true; do
  prs=$(open_prs)
  todos=$(eligible_todos)
  log "cycle prs=$prs todos=$todos"
  if [[ "$prs" == "0" && "$todos" == "0" ]]; then
    log "TARGET REACHED: 0 PRs, 0 todos"
    exit 0
  fi
  [[ -x "$ROOT/scripts/drain-pr-queue.sh" ]] && "$ROOT/scripts/drain-pr-queue.sh" >>"$LOG/drain.log" 2>&1 || true
  [[ -x "$ROOT/scripts/loop-train-drain.sh" ]] && "$ROOT/scripts/loop-train-drain.sh" >>"$LOG/train.log" 2>&1 || true
  log "sleep ${INTERVAL}s"
  sleep "$INTERVAL"
done
