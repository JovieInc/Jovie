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

put_variable() {
  local name="$1"
  local value="$2"

  if gh api "repos/$GH_REPO/actions/variables/$name" >/dev/null 2>&1; then
    gh api -X PATCH "repos/$GH_REPO/actions/variables/$name" \
      -f name="$name" -f value="$value" >/dev/null
  else
    gh api -X POST "repos/$GH_REPO/actions/variables" \
      -f name="$name" -f value="$value" >/dev/null
  fi
}

CURRENT=$(gh api "repos/$GH_REPO/actions/variables/$TARGET_VARIABLE" --jq '.value')
DESIRED=$(target_for_health "$RUNNER_HEALTH")

if [[ "$CURRENT" == "$DESIRED" ]]; then
  put_variable "$STATE_VARIABLE" "$RUNNER_HEALTH:0"
  echo "Runner routing already matches observed health ($RUNNER_HEALTH → $DESIRED)."
  exit 0
fi

STATE=$(gh api "repos/$GH_REPO/actions/variables/$STATE_VARIABLE" --jq '.value' 2>/dev/null || true)
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
put_variable "$STATE_VARIABLE" "$RUNNER_HEALTH:$COUNT"

if [[ "$COUNT" -lt "$FLAP_THRESHOLD" ]]; then
  echo "Observed runner health '$RUNNER_HEALTH' $COUNT/$FLAP_THRESHOLD consecutive checks; routing unchanged."
  exit 0
fi

echo "Observed runner health '$RUNNER_HEALTH' for $COUNT consecutive checks. Setting $TARGET_VARIABLE → $DESIRED."
gh api -X PATCH "repos/$GH_REPO/actions/variables/$TARGET_VARIABLE" \
  -f name="$TARGET_VARIABLE" -f value="$DESIRED" >/dev/null
put_variable "$STATE_VARIABLE" "$RUNNER_HEALTH:0"
