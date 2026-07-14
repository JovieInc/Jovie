#!/usr/bin/env bash
# Continuous loop: drain PRs + trains every N seconds until 0 open PRs and 0 todos.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT"
INTERVAL="${LOOP_INTERVAL:-300}"
LOG="$ROOT/.context/loop-logs"
LOG="${LOOP_LOG_ROOT:-$LOG}"
LOOP_LOG_MAX_BYTES="${LOOP_LOG_MAX_BYTES:-10485760}"

log_boundary() {
  if [[ -z "${LOOP_LOG_ROOT:-}" ]]; then
    printf '%s\n' "$ROOT"
    return
  fi
  if [[ "${LOOP_LOG_TEST_MODE:-}" != "1" ]]; then
    echo "LOOP_LOG_ROOT is restricted to explicit test fixtures" >&2
    return 1
  fi
  local boundary="${LOOP_LOG_TEST_ROOT:-}"
  if [[ -z "$boundary" || "$(basename "$boundary")" != jovie-loop-logs-* ]]; then
    echo "LOOP_LOG_TEST_ROOT must name a jovie-loop-logs-* fixture" >&2
    return 1
  fi
  if [[ -L "$boundary" || ! -d "$boundary" ]]; then
    echo "Refusing unsafe loop log test root: $boundary" >&2
    return 1
  fi
  local real_boundary
  real_boundary="$(cd "$boundary" && pwd -P)" || return 1
  if [[ "$real_boundary" != "$boundary" ]]; then
    echo "Loop log test root must be canonical: $boundary" >&2
    return 1
  fi
  printf '%s\n' "$boundary"
}

ensure_log_root() {
  if ! [[ "$LOOP_LOG_MAX_BYTES" =~ ^[1-9][0-9]*$ ]]; then
    echo "LOOP_LOG_MAX_BYTES must be a positive integer" >&2
    return 1
  fi
  local boundary
  boundary="$(log_boundary)" || return 1
  if [[ "$LOG" != "$boundary"/* || "$(basename "$LOG")" != "loop-logs" ]]; then
    echo "Loop log root must be a loop-logs directory inside $boundary" >&2
    return 1
  fi
  local relative="${LOG#"$boundary"/}"
  local current="$boundary"
  local component
  IFS='/' read -r -a components <<< "$relative"
  for component in "${components[@]}"; do
    if [[ -z "$component" || "$component" == "." || "$component" == ".." ]]; then
      echo "Refusing noncanonical loop log root: $LOG" >&2
      return 1
    fi
    current="$current/$component"
    if [[ -L "$current" ]]; then
      echo "Refusing symlinked loop log path: $current" >&2
      return 1
    fi
    if [[ -e "$current" ]]; then
      if [[ ! -d "$current" ]]; then
        echo "Refusing non-directory loop log path: $current" >&2
        return 1
      fi
    else
      mkdir "$current" || return 1
      if [[ -L "$current" || ! -d "$current" ]]; then
        echo "Refusing unsafe created loop log path: $current" >&2
        return 1
      fi
    fi
  done
  local real_log
  real_log="$(cd "$LOG" && pwd -P)" || return 1
  if [[ "$real_log" != "$LOG" ]]; then
    echo "Loop log root escaped its canonical path: $LOG" >&2
    return 1
  fi
}

validate_rotation_paths() {
  local name="$1"
  ensure_log_root || return 1
  local candidate
  for candidate in "$LOG/$name" "$LOG/$name.1" "$LOG/$name.2"; do
    if [[ -L "$candidate" ]]; then
      echo "Refusing symlinked loop log: $candidate" >&2
      return 1
    fi
    if [[ -e "$candidate" && ! -f "$candidate" ]]; then
      echo "Refusing non-file loop log: $candidate" >&2
      return 1
    fi
  done
}

cleanup_rotation_temp() {
  local name="$1"
  local temporary="$2"
  [[ -e "$temporary" || -L "$temporary" ]] || return 0
  ensure_log_root || return 1
  if [[ "$(dirname "$temporary")" != "$LOG" || "$(basename "$temporary")" != ".$name.rotate."* ]]; then
    echo "Refusing cleanup of unexpected loop log temporary: $temporary" >&2
    return 1
  fi
  if [[ -L "$temporary" || ! -f "$temporary" ]]; then
    echo "Refusing cleanup of unsafe loop log temporary: $temporary" >&2
    return 1
  fi
  rm -f -- "$temporary"
}

rotate_log_if_needed() {
  local name="$1"
  if ! [[ "$name" =~ ^[A-Za-z0-9._-]+\.log$ ]]; then
    echo "Refusing unsafe loop log filename: $name" >&2
    return 1
  fi
  validate_rotation_paths "$name" || return 1
  local file="$LOG/$name"
  local first="$file.1"
  local second="$file.2"
  [[ -f "$file" ]] || return 0
  local size
  size="$(wc -c < "$file" | tr -d ' ')"
  (( size < LOOP_LOG_MAX_BYTES )) && return 0

  local temporary
  temporary="$(mktemp "$LOG/.$name.rotate.XXXXXX")" || return 1
  if ! tail -c "$LOOP_LOG_MAX_BYTES" "$file" > "$temporary"; then
    cleanup_rotation_temp "$name" "$temporary" || true
    return 1
  fi
  if ! validate_rotation_paths "$name"; then
    cleanup_rotation_temp "$name" "$temporary" || true
    return 1
  fi
  if ! rm -f "$second"; then
    cleanup_rotation_temp "$name" "$temporary" || true
    return 1
  fi
  if [[ -f "$first" ]]; then
    if ! validate_rotation_paths "$name" || ! mv "$first" "$second"; then
      cleanup_rotation_temp "$name" "$temporary" || true
      return 1
    fi
  fi
  if ! validate_rotation_paths "$name"; then
    cleanup_rotation_temp "$name" "$temporary" || true
    return 1
  fi
  if [[ -L "$temporary" || ! -f "$temporary" || "$(dirname "$temporary")" != "$LOG" ]]; then
    echo "Refusing unsafe temporary loop log: $temporary" >&2
    cleanup_rotation_temp "$name" "$temporary" || true
    return 1
  fi
  if ! mv "$temporary" "$first"; then
    cleanup_rotation_temp "$name" "$temporary" || true
    return 1
  fi
  validate_rotation_paths "$name" || return 1
  : > "$file"
}

log() {
  rotate_log_if_needed orchestrator.log
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG/orchestrator.log"
  rotate_log_if_needed orchestrator.log
}

bounded_log_sink() {
  local name="$1"
  local file="$LOG/$name"
  local chunk bounded size
  validate_rotation_paths "$name" || return 1

  while true; do
    chunk="$(mktemp "$LOG/.$name.rotate.XXXXXX")" || return 1
    if ! head -c "$LOOP_LOG_MAX_BYTES" > "$chunk"; then
      cleanup_rotation_temp "$name" "$chunk" || true
      return 1
    fi
    size="$(wc -c < "$chunk" | tr -d ' ')"
    if (( size == 0 )); then
      cleanup_rotation_temp "$name" "$chunk" || true
      break
    fi

    bounded="$(mktemp "$LOG/.$name.rotate.XXXXXX")" || {
      cleanup_rotation_temp "$name" "$chunk" || true
      return 1
    }
    if ! { [[ ! -f "$file" ]] || cat "$file"; cat "$chunk"; } \
      | tail -c "$LOOP_LOG_MAX_BYTES" > "$bounded"; then
      cleanup_rotation_temp "$name" "$chunk" || true
      cleanup_rotation_temp "$name" "$bounded" || true
      return 1
    fi
    cleanup_rotation_temp "$name" "$chunk" || {
      cleanup_rotation_temp "$name" "$bounded" || true
      return 1
    }
    if ! validate_rotation_paths "$name" || [[ -L "$bounded" || ! -f "$bounded" ]]; then
      cleanup_rotation_temp "$name" "$bounded" || true
      return 1
    fi
    if ! mv "$bounded" "$file"; then
      cleanup_rotation_temp "$name" "$bounded" || true
      return 1
    fi
  done
}

run_logged() {
  local name="$1"
  shift
  rotate_log_if_needed "$name"
  local -a statuses
  if "$@" 2>&1 | bounded_log_sink "$name"; then
    statuses=("${PIPESTATUS[@]}")
  else
    statuses=("${PIPESTATUS[@]}")
  fi
  local status="${statuses[0]}"
  if (( ${statuses[1]} != 0 )); then
    return "${statuses[1]}"
  fi
  rotate_log_if_needed "$name"
  return "$status"
}
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
main() {
  ensure_log_root
  log "orchestrator start interval=${INTERVAL}s pid=$$"
  while true; do
    prs=$(open_prs)
    todos=$(eligible_todos)
    log "cycle prs=$prs todos=$todos"
    if [[ "$prs" == "0" && "$todos" == "0" ]]; then
      log "TARGET REACHED: 0 PRs, 0 todos"
      exit 0
    fi
    [[ ! -x "$ROOT/scripts/drain-pr-queue.sh" ]] || run_logged drain.log "$ROOT/scripts/drain-pr-queue.sh" || true
    [[ ! -x "$ROOT/scripts/loop-train-drain.sh" ]] || run_logged train.log "$ROOT/scripts/loop-train-drain.sh" || true
    log "sleep ${INTERVAL}s"
    sleep "$INTERVAL"
  done
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
