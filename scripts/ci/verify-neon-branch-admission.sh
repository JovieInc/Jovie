#!/usr/bin/env bash
set -euo pipefail

MAX_ATTEMPTS="${NEON_ADMISSION_ATTEMPTS:-12}"
RETRY_SECONDS="${NEON_ADMISSION_RETRY_SECONDS:-15}"
CONNECTION_FILE="${CONNECTION_FILE:?CONNECTION_FILE is required}"
WORKSPACE="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
PROBE_PATH="${NEON_ADMISSION_PROBE_PATH:-$WORKSPACE/scripts/ci/probe-neon-branch.mjs}"
REAPER_PATH="${NEON_ADMISSION_REAPER_PATH:-$WORKSPACE/scripts/ci/neon-orphan-reaper.mjs}"

if ! [[ "$MAX_ATTEMPTS" =~ ^[1-9][0-9]*$ ]]; then
  echo "NEON_ADMISSION_ATTEMPTS must be a positive integer." >&2
  exit 2
fi
if ! [[ "$RETRY_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "NEON_ADMISSION_RETRY_SECONDS must be a non-negative integer." >&2
  exit 2
fi
if [ ! -f "$CONNECTION_FILE" ]; then
  echo "Neon admission connection file is missing: $CONNECTION_FILE" >&2
  exit 2
fi

DATABASE_URL="$(jq -er '.db_url | select(type == "string" and length > 0)' "$CONNECTION_FILE")"
BRANCH_NAME="$(jq -r '.branch_name // "unknown"' "$CONNECTION_FILE")"
export DATABASE_URL

is_exact_capacity_error() {
  local output="$1"
  printf '%s' "$output" | grep -Eqi 'HTTP([[:space:]-]+status)?[[:space:]:=-]*402([^0-9]|$)' \
    && printf '%s' "$output" | grep -Fqi 'You have exceeded the limit of concurrently active endpoints.'
}

for ((attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1)); do
  set +e
  output="$(node "$PROBE_PATH" 2>&1)"
  exit_code=$?
  set -e
  printf '%s\n' "$output"

  if [ "$exit_code" -eq 0 ]; then
    echo "Neon branch $BRANCH_NAME admitted on SELECT 1 attempt ${attempt}/${MAX_ATTEMPTS}."
    exit 0
  fi

  if ! is_exact_capacity_error "$output"; then
    echo "Neon SELECT 1 failed with a non-capacity error; refusing to reap or retry." >&2
    exit "$exit_code"
  fi

  if [ "$attempt" -eq "$MAX_ATTEMPTS" ]; then
    echo "Neon endpoint capacity remained full after ${MAX_ATTEMPTS} SELECT 1 attempts on branch $BRANCH_NAME." >&2
    exit "$exit_code"
  fi

  echo "Neon returned exact HTTP 402 endpoint capacity on branch $BRANCH_NAME; reaping proven completed owners before retrying the same branch."
  node "$REAPER_PATH"
  sleep "$RETRY_SECONDS"
done
