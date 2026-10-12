#!/usr/bin/env bash
# Mac-first lanes: run a macOS job on an idle self-hosted jovie-mac runner when
# one is free right now, and on hosted macOS otherwise. Policy:
# .claude/rules/infra.md "macOS runners".
#
#   dispatch  start the Mac child run (mac-lane.yml) and wait a bounded window
#             for a Mac to pick it up; otherwise cancel the child -> fallback.
#             Pickup is the live runner-state check: GITHUB_TOKEN cannot list
#             org runners, and merge-group jobs get no app secrets.
#   result    read the finished child run -> success, genuine failure (exit 1),
#             or infra (asleep/offline/timeout) so the caller runs hosted
#
# The Mac work lives in a separate child run so a stuck Mac job is cancelled
# there; the parent run never carries a cancelled job (a cancelled job makes
# the whole run conclude "cancelled", which staging/production gates reject).
# Every uncertainty resolves to hosted; nothing waits on a Mac.
set -uo pipefail

MAC_LABEL="${MAC_LABEL:-jovie-mac}"
API_TIMEOUT_SECONDS="${API_TIMEOUT_SECONDS:-15}"

emit() {
  local out="${GITHUB_OUTPUT:-/dev/stdout}"
  printf '%s=%s\n' "$1" "$2" >> "$out"
}

api() {
  timeout "${API_TIMEOUT_SECONDS}s" gh api "$@"
}

# Mac jobs in the child run are the ones whose labels include MAC_LABEL.
mac_jobs() {
  api "repos/$GH_REPO/actions/runs/$1/jobs?filter=latest&per_page=100" \
    --jq "[.jobs[] | select(any(.labels[]; . == \"$MAC_LABEL\"))]"
}

fallback() {
  emit fallback true
  echo "::notice::Mac lane ${LANE:-?} falls back to hosted macOS: $1"
  exit 0
}

dispatch() {
  local pickup="${PICKUP_SECONDS:-45}" poll="${POLL_SECONDS:-10}"
  local response run_id jobs state deadline
  emit join_group "$JOIN_GROUP"
  if ! response="$(api -X POST "repos/$GH_REPO/actions/workflows/mac-lane.yml/dispatches" \
    -f ref="$DISPATCH_REF" -F return_run_details=true \
    -f "inputs[lane]=$LANE" -f "inputs[sha]=$CHECKOUT_SHA" \
    -f "inputs[join-group]=$JOIN_GROUP" -f "inputs[supersede-group]=$SUPERSEDE_GROUP" \
    -f "inputs[parent]=$PARENT_RUN")" \
    || ! run_id="$(jq -er '.workflow_run_id' <<<"$response")"; then
    fallback "child dispatch failed"
  fi
  emit child_run_id "$run_id"
  echo "Mac child run: $GITHUB_SERVER_URL/$GH_REPO/actions/runs/$run_id"
  deadline=$(( SECONDS + pickup ))
  sleep "${FIRST_POLL_SECONDS:-8}"
  while :; do
    # A Mac job that left the queue (running or already finished) holds the
    # join group, so the parent's join waits on it without polling.
    if jobs="$(mac_jobs "$run_id")"; then
      state="$(jq -r 'if length == 0 then "none" elif all(.[]; .status == "in_progress" or .status == "completed") then "picked" else "queued" end' <<<"$jobs")"
      if [ "$state" = picked ]; then
        emit fallback false
        echo "::notice::Mac lane $LANE picked up by $(jq -r '[.[].runner_name // empty] | unique | join(",")' <<<"$jobs")"
        exit 0
      fi
    fi
    if (( SECONDS >= deadline )); then
      api -X POST "repos/$GH_REPO/actions/runs/$run_id/cancel" >/dev/null 2>&1 || true
      fallback "no Mac picked up the child run within ${pickup}s"
    fi
    sleep "$poll"
  done
}

result() {
  local jobs verdict
  if ! jobs="$(mac_jobs "$CHILD_RUN_ID")"; then
    emit infra true
    echo "::warning::Mac child run $CHILD_RUN_ID unreadable; running hosted."
    exit 0
  fi
  # success: every Mac job passed. failure: a step failed (a real test or build
  # failure). Anything else (cancelled, timed out, runner lost) is the Mac's
  # fault, not the change's, so the hosted job runs instead.
  verdict="$(jq -r '
    if length == 0 then "infra"
    elif all(.[]; .conclusion == "success" or .conclusion == "skipped") then "success"
    elif any(.[]; .conclusion == "failure" and any(.steps[]?; .conclusion == "failure")) then "failure"
    else "infra" end' <<<"$jobs")"
  emit infra "$([ "$verdict" = infra ] && echo true || echo false)"
  local url="$GITHUB_SERVER_URL/$GH_REPO/actions/runs/$CHILD_RUN_ID"
  case "$verdict" in
    success) echo "::notice::Mac lane ${LANE:-?} passed on a Mac: $url" ;;
    failure) echo "::error::Mac lane ${LANE:-?} failed on a Mac: $url"; exit 1 ;;
    *) echo "::warning::Mac lane ${LANE:-?} lost its Mac ($url); running hosted." ;;
  esac
}

case "${1:-}" in
  dispatch) dispatch ;;
  result) result ;;
  *) echo "usage: $0 dispatch|result" >&2; exit 2 ;;
esac
