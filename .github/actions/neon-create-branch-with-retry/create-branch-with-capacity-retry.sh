#!/usr/bin/env bash
set -euo pipefail

MAX_ATTEMPTS="${NEON_CREATE_ATTEMPTS:-12}"
RETRY_SECONDS="${NEON_CREATE_RETRY_SECONDS:-15}"
ACTION_PATH="${GITHUB_ACTION_PATH:?GITHUB_ACTION_PATH is required}"
REAPER_PATH="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}/scripts/ci/neon-orphan-reaper.mjs"

run_reaper() {
  node "$REAPER_PATH"
}

# Clear only positively proven completed-run owners before the first atomic
# provider admission attempt.
run_reaper

for ((attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1)); do
  set +e
  output="$(bash "$ACTION_PATH/create-branch.sh" 2>&1)"
  exit_code=$?
  set -e
  printf '%s\n' "$output"

  if [ "$exit_code" -eq 0 ]; then
    exit 0
  fi

  if ! printf '%s' "$output" | grep -Eqi \
    'exceeded (the )?limit of concurrently active endpoints|concurrently active endpoint limit'; then
    echo "Neon branch creation failed with a non-capacity error; refusing to retry."
    exit "$exit_code"
  fi

  if [ "$attempt" -eq "$MAX_ATTEMPTS" ]; then
    echo "Neon endpoint capacity remained full after ${MAX_ATTEMPTS} provider admission attempts."
    exit "$exit_code"
  fi

  echo "Neon endpoint capacity full on attempt ${attempt}/${MAX_ATTEMPTS}; reaping completed owners before bounded retry."
  run_reaper
  sleep "$RETRY_SECONDS"
done
