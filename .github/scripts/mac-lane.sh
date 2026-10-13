#!/usr/bin/env bash
# Mac-first lanes (see mac-lane-route.yml; policy .claude/rules/infra.md
# "macOS runners"). dispatch: start the mac-lane.yml child and wait for a Mac
# to pick it up, else cancel it (fallback). result: read the finished child:
# success, real failure (exit 1), or infra (lost Mac -> the caller runs hosted).
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
  local pickup="${MAC_PICKUP_SECONDS:-45}" poll="${POLL_SECONDS:-10}"
  local response run_id jobs state deadline lane_args="${LANE_ARGS:-}"
  [ -n "$lane_args" ] || lane_args='{}'
  emit join_group "$JOIN_GROUP"
  if ! response="$(api -X POST "repos/$GH_REPO/actions/workflows/mac-lane.yml/dispatches" \
    -f ref="$DISPATCH_REF" -F return_run_details=true \
    -f "inputs[lane]=$LANE" -f "inputs[sha]=$CHECKOUT_SHA" \
    -f "inputs[join-group]=$JOIN_GROUP" -f "inputs[supersede-group]=$SUPERSEDE_GROUP" \
    -f "inputs[parent]=$PARENT_RUN" -f "inputs[args]=$lane_args")" \
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

summary() {
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] && printf '%s\n' "$1" >> "$GITHUB_STEP_SUMMARY"
  return 0
}

result() {
  local jobs verdict title
  local url="$GITHUB_SERVER_URL/$GH_REPO/actions/runs/$CHILD_RUN_ID"
  summary "Mac lane ${LANE:-?}: child run $url"
  # The child names the exact SHA it checked out; anything else is not
  # evidence for this commit, so the hosted job runs instead.
  if ! title="$(api "repos/$GH_REPO/actions/runs/$CHILD_RUN_ID" --jq .display_title)" \
    || [[ "$title" != *"@ $CHECKOUT_SHA "* ]] \
    || ! jobs="$(mac_jobs "$CHILD_RUN_ID")"; then
    emit infra true
    echo "::warning::Mac child run $url unreadable or not for $CHECKOUT_SHA; running hosted."
    summary "Unreadable or wrong SHA: running hosted."
    exit 0
  fi
  # success: every Mac job passed. failure: a build or test step failed and the
  # lane fails. Anything else (cancelled, timed out, runner lost, or only a
  # checkout/setup step failed) is the Mac's fault, not the change's, so the
  # hosted job runs and its result decides the lane. Setup failures were the
  # Mac's uplink timing out on the registry (run 38311623148); a change that
  # really breaks setup fails again on hosted.
  verdict="$(jq -r '
    def setup: test("^(Set up |Setup |Run actions/checkout@|Run \\./\\.github/actions/setup-)");
    if length == 0 then "infra"
    elif all(.[]; .conclusion == "success" or .conclusion == "skipped") then "success"
    elif any(.[]; .conclusion == "failure" and any(.steps[]?; .conclusion == "failure" and (.name | setup | not))) then "failure"
    else "infra" end' <<<"$jobs")"
  emit infra "$([ "$verdict" = infra ] && echo true || echo false)"
  summary "Result: $verdict"
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
