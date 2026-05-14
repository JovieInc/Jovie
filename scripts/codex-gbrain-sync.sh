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
  const raw = fs.readFileSync(process.argv[1], "utf8").trim();
  let pid;
  try {
    const parsed = JSON.parse(raw);
    pid = typeof parsed === "number" ? parsed : parsed?.pid;
  } catch {
    if (/^[0-9]+$/.test(raw)) pid = Number(raw);
  }
  if (Number.isInteger(pid)) process.stdout.write(String(pid));
} catch {}
' "$lock_file" 2>/dev/null)"

  if [[ -n "$lock_pid" ]] && ! kill -0 "$lock_pid" >/dev/null 2>&1; then
    rm -f "$lock_file"
  fi
}

clear_dead_gbrain_db_sync_lock() {
  local config_file="$HOME/.gbrain/config.json"
  local gbrain_repo="$HOME/.gbrain/gbrain"
  [[ -f "$config_file" ]] || return 0
  [[ -d "$gbrain_repo/node_modules/@electric-sql/pglite" ]] || return 0
  command -v bun >/dev/null 2>&1 || return 0

  local output_file
  output_file="$(mktemp "${TMPDIR:-/tmp}/codex-gbrain-db-lock.XXXXXX")"
  run_capture 5 "$output_file" bash -lc '
cd "$1" || exit 0
GBRAIN_CONFIG_FILE="$2" bun --eval '"'"'
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

try {
  const config = JSON.parse(readFileSync(process.env.GBRAIN_CONFIG_FILE, "utf8"));
  if (config.engine !== "pglite" || !config.database_path) process.exit(0);

  const db = new PGlite(config.database_path);
  try {
    const result = await db.query(
      "SELECT holder_pid FROM gbrain_cycle_locks WHERE id = $1",
      ["gbrain-sync"],
    );
    const pid = result.rows?.[0]?.holder_pid;
    if (Number.isInteger(pid)) {
      let alive = true;
      try {
        process.kill(pid, 0);
      } catch {
        alive = false;
      }
      if (!alive) {
        await db.query(
          "DELETE FROM gbrain_cycle_locks WHERE id = $1 AND holder_pid = $2",
          ["gbrain-sync", pid],
        );
      }
    }
  } finally {
    await db.close();
  }
} catch {}
'"'"'
' bash "$gbrain_repo" "$config_file" || true
  rm -f "$output_file"
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

gbrain_source_registry_available() {
  local output_file
  output_file="$(mktemp "${TMPDIR:-/tmp}/codex-gbrain-sources.XXXXXX")"
  run_capture 5 "$output_file" gbrain sources list --json
  local status=$?

  if [[ "$status" -eq 0 ]]; then
    rm -f "$output_file"
    return 0
  fi

  local last_line
  last_line="$(failure_summary "$output_file")"
  rm -f "$output_file"
  if [[ "$status" -eq 124 ]]; then
    echo "GBrain: source registry probe timed out; skipped auto-sync for ${PHASE}."
  else
    echo "GBrain: source registry unavailable; skipped auto-sync for ${PHASE}. ${last_line}"
  fi
  return 1
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

if [[ "$status" == "error" ]]; then
  echo "GBrain: doctor status is '${status}'; skipped auto-sync for ${PHASE}."
  exit 0
fi

if [[ "$health_score" =~ ^[0-9]+$ ]] && (( 10#$health_score < 70 )); then
  echo "GBrain: health=${health_score}, status=${status:-unknown}; skipped auto-sync for ${PHASE}."
  exit 0
fi

if [[ ! "$health_score" =~ ^[0-9]+$ ]] && [[ "$status" != "ok" && "$status" != "warnings" ]]; then
  echo "GBrain: doctor status is '${status:-unknown}' and no numeric health score was reported; skipped auto-sync for ${PHASE}."
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
clear_dead_gbrain_db_sync_lock
if ! gbrain_source_registry_available; then
  rm -f "$sync_output"
  exit 0
fi
run_capture "$GBRAIN_SYNC_TIMEOUT_SECONDS" "$sync_output" bun "$sync_script" --incremental --quiet --no-memory
sync_status=$?

if [[ "$sync_status" -eq 124 ]]; then
  clear_dead_gbrain_sync_lock
  clear_dead_gbrain_db_sync_lock
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
