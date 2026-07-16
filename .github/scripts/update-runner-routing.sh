#!/usr/bin/env bash
set -euo pipefail

: "${GH_REPO:?GH_REPO is required}"
: "${RUNNER_HEALTH:?RUNNER_HEALTH must be up or down}"

TARGET_VARIABLE="${TARGET_VARIABLE:-CI_FAST_RUNNER}"
STATE_VARIABLE="${STATE_VARIABLE:-CI_FAST_RUNNER_HEALTH_STATE}"
OFFLINE_TARGET="${OFFLINE_TARGET:-ubuntu-latest}"
ONLINE_TARGET="${ONLINE_TARGET:-jovie-runner}"
FLAP_THRESHOLD="${FLAP_THRESHOLD:-2}"

if [[ "$RUNNER_HEALTH" != "up" && "$RUNNER_HEALTH" != "down" ]]; then
  echo "RUNNER_HEALTH must be up or down" >&2
  exit 2
fi

if ! [[ "$FLAP_THRESHOLD" =~ ^[1-9][0-9]*$ ]]; then
  echo "FLAP_THRESHOLD must be a positive integer" >&2
  exit 2
fi

target_for_health() {
  if [[ "$1" == "up" ]]; then
    printf '%s\n' "$ONLINE_TARGET"
  else
    printf '%s\n' "$OFFLINE_TARGET"
  fi
}

api_error="$(mktemp)"
trap 'rm -f "$api_error"' EXIT

report_api_failure() {
  local operation="$1"
  local routing_disposition="$2"

  if grep -Eqi 'HTTP (401|403)|bad credentials|resource not accessible' "$api_error"; then
    echo "Runner routing credential/permission failure during $operation (HTTP 401/403). $routing_disposition Verify the Jovie Bot installation can read and write Actions variables." >&2
  else
    echo "Runner routing Actions API failure during $operation. $routing_disposition" >&2
  fi
  cat "$api_error" >&2
  exit 3
}

is_not_found() {
  grep -Eq 'HTTP 404|Not Found|not found' "$api_error"
}

put_variable() {
  local name="$1"
  local value="$2"
  local routing_disposition="$3"

  : > "$api_error"
  if gh api "repos/$GH_REPO/actions/variables/$name" >/dev/null 2>"$api_error"; then
    : > "$api_error"
    if ! gh api -X PATCH "repos/$GH_REPO/actions/variables/$name" \
      -f name="$name" -f value="$value" >/dev/null 2>"$api_error"; then
      report_api_failure "updating repository variable '$name'" "$routing_disposition"
    fi
  elif is_not_found; then
    : > "$api_error"
    if ! gh api -X POST "repos/$GH_REPO/actions/variables" \
      -f name="$name" -f value="$value" >/dev/null 2>"$api_error"; then
      report_api_failure "creating repository variable '$name'" "$routing_disposition"
    fi
  else
    report_api_failure "reading repository variable '$name'" "$routing_disposition"
  fi
}

: > "$api_error"
if ! CURRENT=$(gh api "repos/$GH_REPO/actions/variables/$TARGET_VARIABLE" --jq '.value' 2>"$api_error"); then
  report_api_failure "reading repository variable '$TARGET_VARIABLE'" "The routing target was not changed."
fi
DESIRED=$(target_for_health "$RUNNER_HEALTH")

if [[ "$CURRENT" == "$DESIRED" ]]; then
  put_variable "$STATE_VARIABLE" "$RUNNER_HEALTH:0" "The routing target already matched; only the debounce-state reset failed."
  echo "Runner routing already matches observed health ($RUNNER_HEALTH → $DESIRED)."
  exit 0
fi

: > "$api_error"
if ! STATE=$(gh api "repos/$GH_REPO/actions/variables/$STATE_VARIABLE" --jq '.value' 2>"$api_error"); then
  if is_not_found; then
    STATE=""
  else
    report_api_failure "reading repository variable '$STATE_VARIABLE'" "The routing target was not changed."
  fi
fi
STATE_HEALTH="${STATE%%:*}"
STATE_COUNT="${STATE#*:}"
if [[ "$STATE" == "$STATE_HEALTH" ]] || ! [[ "$STATE_COUNT" =~ ^[0-9]+$ ]]; then
  STATE_COUNT=0
fi

if [[ "$STATE_HEALTH" == "$RUNNER_HEALTH" ]]; then
  COUNT=$((STATE_COUNT + 1))
else
  COUNT=1
fi

# Repository variables persist across scheduled jobs even when each run uses a
# different GitHub-hosted VM. runner.temp cannot provide that guarantee.
put_variable "$STATE_VARIABLE" "$RUNNER_HEALTH:$COUNT" "The routing target was not changed."

if [[ "$COUNT" -lt "$FLAP_THRESHOLD" ]]; then
  echo "Observed runner health '$RUNNER_HEALTH' $COUNT/$FLAP_THRESHOLD consecutive checks; routing unchanged."
  exit 0
fi

echo "Observed runner health '$RUNNER_HEALTH' for $COUNT consecutive checks. Setting $TARGET_VARIABLE → $DESIRED."
: > "$api_error"
if ! gh api -X PATCH "repos/$GH_REPO/actions/variables/$TARGET_VARIABLE" \
  -f name="$TARGET_VARIABLE" -f value="$DESIRED" >/dev/null 2>"$api_error"; then
  report_api_failure "updating repository variable '$TARGET_VARIABLE'" "The routing target was not changed; persisted debounce state will make the next tick retry."
fi
put_variable "$STATE_VARIABLE" "$RUNNER_HEALTH:0" "The routing target changed successfully, but the debounce-state reset failed; the next tick will reconcile it."
