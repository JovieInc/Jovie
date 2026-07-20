#!/usr/bin/env bash
set -uo pipefail

QUERY_HELPER="${RUNNER_HEARTBEAT_QUERY_HELPER:-$(dirname "$0")/query-runner-heartbeat.sh}"
POLL_ATTEMPTS="${HEARTBEAT_POLL_ATTEMPTS:-10}"
POLL_INTERVAL_SECONDS="${HEARTBEAT_POLL_INTERVAL_SECONDS:-5}"

emit_hosted() {
  local probe_state="$1"
  local evidence="$2"
  case "$probe_state" in
    unhealthy|uncertain) ;;
    *) probe_state=uncertain ;;
  esac
  echo "Runner health: down — $evidence"
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    {
      echo "health=down"
      echo "probe_state=$probe_state"
      echo "evidence=$evidence"
    } >> "$GITHUB_OUTPUT"
  fi
}

if ! [[ "$POLL_ATTEMPTS" =~ ^[1-9][0-9]*$ ]]; then
  emit_hosted uncertain "heartbeat poll bound is malformed; using hosted capacity"
  exit 0
fi
if ! [[ "$POLL_INTERVAL_SECONDS" =~ ^[1-9][0-9]*$ ]]; then
  emit_hosted uncertain "heartbeat poll interval is malformed; using hosted capacity"
  exit 0
fi
if [[ ! -x "$QUERY_HELPER" ]]; then
  emit_hosted uncertain "trusted heartbeat query helper is unavailable; using hosted capacity"
  exit 0
fi

query_output="$(mktemp)"
trap 'rm -f "$query_output"' EXIT

for ((attempt = 1; attempt <= POLL_ATTEMPTS; attempt++)); do
  : > "$query_output"
  if ! GITHUB_OUTPUT="$query_output" "$QUERY_HELPER"; then
    emit_hosted uncertain "trusted heartbeat query failed; using hosted capacity"
    exit 0
  fi

  health="$(awk -F= '$1 == "health" {sub(/^[^=]*=/, ""); value=$0} END {print value}' "$query_output")"
  probe_state="$(awk -F= '$1 == "probe_state" {sub(/^[^=]*=/, ""); value=$0} END {print value}' "$query_output")"
  evidence="$(awk -F= '$1 == "evidence" {sub(/^[^=]*=/, ""); value=$0} END {print value}' "$query_output")"

  if [[ "$health" == "up" && "$probe_state" == "healthy" ]]; then
    cat "$query_output" >> "${GITHUB_OUTPUT:-/dev/null}"
    exit 0
  fi

  # Only a current exact probe that GitHub has not finished may be retried.
  # Stale/failed/cancelled probes and every API/schema/identity uncertainty
  # select hosted capacity immediately.
  if [[ "$probe_state" != "pending" ]]; then
    emit_hosted "$probe_state" "${evidence:-heartbeat evidence is uncertain}; using hosted capacity"
    exit 0
  fi

  if (( attempt == POLL_ATTEMPTS )); then
    emit_hosted unhealthy "current exact heartbeat remained pending after ${POLL_ATTEMPTS} observations; using hosted capacity"
    exit 0
  fi
  sleep "$POLL_INTERVAL_SECONDS"
done

emit_hosted unhealthy "heartbeat observer exhausted its bounded poll; using hosted capacity"
