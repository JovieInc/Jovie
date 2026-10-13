#!/usr/bin/env bash
set -euo pipefail

MAX_ATTEMPTS="${NEON_CREATE_ATTEMPTS:-12}"
RETRY_SECONDS="${NEON_CREATE_RETRY_SECONDS:-15}"
# HTTP 5xx backoff: 2s, 4s, 8s, 16s, then the 30s cap. Attempt count stays
# on NEON_CREATE_ATTEMPTS so a stuck provider cannot retry without bound.
BACKOFF_BASE="${NEON_CREATE_5XX_BACKOFF_SECONDS:-2}"
BACKOFF_CAP="${NEON_CREATE_5XX_BACKOFF_CAP_SECONDS:-30}"
ACTION_PATH="${GITHUB_ACTION_PATH:?GITHUB_ACTION_PATH is required}"
REAPER_PATH="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}/scripts/ci/neon-orphan-reaper.mjs"

if ! [[ "$BACKOFF_BASE" =~ ^[0-9]+$ ]]; then
  echo "NEON_CREATE_5XX_BACKOFF_SECONDS must be a non-negative integer." >&2
  exit 2
fi
if ! [[ "$BACKOFF_CAP" =~ ^[0-9]+$ ]]; then
  echo "NEON_CREATE_5XX_BACKOFF_CAP_SECONDS must be a non-negative integer." >&2
  exit 2
fi

run_reaper() {
  node "$REAPER_PATH"
}

# capacity: endpoint quota (including HTTP 402 with the provider's limit text).
# http-5xx: transient provider/gateway failures such as HTTP 502.
# fatal: HTTP 4xx that is not the capacity limit, and every other error.
classify_create_failure() {
  local output="$1"
  if printf '%s' "$output" | grep -Eqi \
    'exceeded (the )?limit of concurrently active endpoints|concurrently active endpoint limit'; then
    printf '%s' capacity
    return
  fi
  if printf '%s' "$output" | grep -Eqi \
    'HTTP([[:space:]-]+status)?[[:space:]:=-]*5[0-9]{2}([^0-9]|$)'; then
    printf '%s' http-5xx
    return
  fi
  printf '%s' fatal
}

five_xx_delay() {
  local attempt="$1"
  local shift=$((attempt - 1))
  local delay
  if [ "$shift" -gt 4 ]; then
    shift=4
  fi
  delay=$((BACKOFF_BASE * (1 << shift)))
  if [ "$delay" -gt "$BACKOFF_CAP" ]; then
    delay="$BACKOFF_CAP"
  fi
  printf '%s' "$delay"
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

  failure="$(classify_create_failure "$output")"
  if [ "$failure" = "fatal" ]; then
    echo "Neon branch creation failed with a non-capacity error; refusing to retry."
    exit "$exit_code"
  fi

  if [ "$attempt" -eq "$MAX_ATTEMPTS" ]; then
    if [ "$failure" = "capacity" ]; then
      echo "Neon endpoint capacity remained full after ${MAX_ATTEMPTS} provider admission attempts."
    else
      echo "Neon branch creation still returned HTTP 5xx after ${MAX_ATTEMPTS} attempts."
    fi
    exit "$exit_code"
  fi

  if [ "$failure" = "capacity" ]; then
    echo "Neon endpoint capacity full on attempt ${attempt}/${MAX_ATTEMPTS}; reaping completed owners before bounded retry."
    run_reaper
    sleep "$RETRY_SECONDS"
  else
    delay="$(five_xx_delay "$attempt")"
    echo "Neon branch creation returned HTTP 5xx on attempt ${attempt}/${MAX_ATTEMPTS}; bounded backoff ${delay}s before retry."
    sleep "$delay"
  fi
done
