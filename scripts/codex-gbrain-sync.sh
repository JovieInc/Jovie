#!/usr/bin/env bash
#
# Lightweight GBrain maintenance for Codex lifecycle hooks.
#
# Runs a bounded health check, then performs the cheap incremental sync path when
# local GBrain is configured. Hook callers must treat this as best effort: a
# broken or busy brain should not block Codex setup/cleanup.
set -u

PHASE="${1:-manual}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
GBRAIN_DOCTOR_TIMEOUT_SECONDS="${CODEX_GBRAIN_DOCTOR_TIMEOUT_SECONDS:-10}"
GBRAIN_SYNC_TIMEOUT_SECONDS="${CODEX_GBRAIN_SYNC_TIMEOUT_SECONDS:-60}"

normalize_timeout_seconds() {
  local raw="$1"
  local fallback="$2"

  if [[ "$raw" =~ ^[0-9]+$ ]] && (( 10#$raw > 0 )); then
    printf '%s\n' "$raw"
  else
    printf '%s\n' "$fallback"
  fi
}

GBRAIN_DOCTOR_TIMEOUT_SECONDS="$(normalize_timeout_seconds "$GBRAIN_DOCTOR_TIMEOUT_SECONDS" 10)"
GBRAIN_SYNC_TIMEOUT_SECONDS="$(normalize_timeout_seconds "$GBRAIN_SYNC_TIMEOUT_SECONDS" 60)"

cd "$REPO_ROOT" || exit 0

find_gbrain_sync_script() {
  local candidate
  for candidate in \
    "$HOME/.claude/skills/gstack/bin/gstack-gbrain-sync.ts" \
    "$HOME/.codex/skills/gstack/bin/gstack-gbrain-sync.ts" \
    "$REPO_ROOT/.agents/skills/gstack/bin/gstack-gbrain-sync.ts"
  do
    if [[ -f "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

run_capture() {
  local timeout_seconds="$1"
  local output_file="$2"
  shift 2

  "$@" >"$output_file" 2>&1 &
  local pid=$!
  local started_at
  started_at="$(date +%s)"

  while kill -0 "$pid" >/dev/null 2>&1; do
    local now
    now="$(date +%s)"
    if (( now - started_at >= timeout_seconds )); then
      kill_process_tree "$pid" TERM
      sleep 1
      kill_process_tree "$pid" KILL
      wait "$pid" >/dev/null 2>&1 || true
      return 124
    fi
    sleep 0.2
  done

  wait "$pid"
}

kill_process_tree() {
  local pid="$1"
  local signal="$2"
  local child

  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_process_tree "$child" "$signal"
  done

  kill "-${signal}" "$pid" >/dev/null 2>&1 || true
}

clear_dead_gbrain_sync_lock() {
  local lock_file="$HOME/.gstack/.sync-gbrain.lock"
  [[ -f "$lock_file" ]] || return 0

  local lock_pid
  lock_pid="$(node -e '
const fs = require("node:fs");
try {
  const pid = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))?.pid;
  if (Number.isInteger(pid)) process.stdout.write(String(pid));
} catch {}
' "$lock_file" 2>/dev/null)"

  if [[ -n "$lock_pid" ]] && ! kill -0 "$lock_pid" >/dev/null 2>&1; then
    rm -f "$lock_file"
  fi
}

failure_summary() {
  local file="$1"
  awk '
    /ERR[[:space:]]/ { err = $0 }
    NF { last = $0 }
    END {
      if (err) print err;
      else if (last) print last;
    }
  ' "$file" 2>/dev/null
}

json_field() {
  local file="$1"
  local field="$2"
  node -e '
const fs = require("node:fs");
const [file, field] = process.argv.slice(1);
try {
  const value = JSON.parse(fs.readFileSync(file, "utf8"))?.[field];
  if (value !== undefined && value !== null) process.stdout.write(String(value));
} catch {}
' "$file" "$field" 2>/dev/null
}

sync_summary() {
  local state_file="$HOME/.gstack/.gbrain-sync-state.json"
  [[ -f "$state_file" ]] || return 0

  node -e '
const fs = require("node:fs");
const statePath = process.argv[1];
try {
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const code = (state.last_stages || []).find((stage) => stage.name === "code");
  if (!code) process.exit(0);
  const detail = code.detail || {};
  const source = detail.source_id || "code source";
  const pages = detail.page_count ?? "unknown";
  process.stdout.write(`${source}, pages=${pages}`);
} catch {}
' "$state_file" 2>/dev/null
}

if ! command -v gbrain >/dev/null 2>&1; then
  echo "GBrain: unavailable; gbrain CLI is not on PATH. Run /setup-gbrain to enable Codex auto-sync."
  exit 0
fi

if [[ ! -f "$HOME/.gbrain/config.json" ]]; then
  echo "GBrain: CLI found, but ~/.gbrain/config.json is missing. Run /setup-gbrain before relying on GBrain."
  exit 0
fi

doctor_output="$(mktemp "${TMPDIR:-/tmp}/codex-gbrain-doctor.XXXXXX")"
run_capture "$GBRAIN_DOCTOR_TIMEOUT_SECONDS" "$doctor_output" gbrain doctor --fast --json
doctor_status=$?

if [[ "$doctor_status" -eq 124 ]]; then
  rm -f "$doctor_output"
  echo "GBrain: doctor timed out after ${GBRAIN_DOCTOR_TIMEOUT_SECONDS}s; skipped auto-sync for ${PHASE}."
  exit 0
fi

if [[ "$doctor_status" -ne 0 ]]; then
  last_line="$(failure_summary "$doctor_output")"
  rm -f "$doctor_output"
  echo "GBrain: doctor failed; skipped auto-sync for ${PHASE}. ${last_line}"
  exit 0
fi

health_score="$(json_field "$doctor_output" health_score)"
status="$(json_field "$doctor_output" status)"
rm -f "$doctor_output"

if [[ "$health_score" =~ ^[0-9]+$ ]] && (( health_score < 70 )); then
  echo "GBrain: health=${health_score}, status=${status:-unknown}; skipped auto-sync for ${PHASE}."
  exit 0
fi

sync_script="$(find_gbrain_sync_script || true)"
if [[ -z "$sync_script" ]]; then
  echo "GBrain: healthy (${status:-unknown}, health=${health_score:-unknown}); sync helper not found, so Codex did not update the index."
  exit 0
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "GBrain: healthy (${status:-unknown}, health=${health_score:-unknown}); bun is missing, so Codex could not run ${sync_script}."
  exit 0
fi

sync_output="$(mktemp "${TMPDIR:-/tmp}/codex-gbrain-sync.XXXXXX")"
clear_dead_gbrain_sync_lock
run_capture "$GBRAIN_SYNC_TIMEOUT_SECONDS" "$sync_output" bun "$sync_script" --incremental --quiet --no-memory
sync_status=$?

if [[ "$sync_status" -eq 124 ]]; then
  clear_dead_gbrain_sync_lock
  rm -f "$sync_output"
  echo "GBrain: sync timed out after ${GBRAIN_SYNC_TIMEOUT_SECONDS}s during ${PHASE}; it will retry on the next Codex hook."
  exit 0
fi

if [[ "$sync_status" -ne 0 ]]; then
  last_line="$(failure_summary "$sync_output")"
  rm -f "$sync_output"
  echo "GBrain: healthy (${status:-unknown}, health=${health_score:-unknown}); auto-sync exited ${sync_status} during ${PHASE}. ${last_line}"
  exit 0
fi

rm -f "$sync_output"
summary="$(sync_summary)"
if [[ -n "$summary" ]]; then
  echo "GBrain: healthy (${status:-unknown}, health=${health_score:-unknown}); auto-sync complete for ${PHASE} (${summary})."
else
  echo "GBrain: healthy (${status:-unknown}, health=${health_score:-unknown}); auto-sync complete for ${PHASE}."
fi
