#!/usr/bin/env bash
# Re-run a Source Validation run's failed jobs, but only when PR Ready is the
# sole failure (it failed only because the fleet verdict was missing/stale).
# Re-running real failures for an author would just burn CI. Bounded by attempt.
# Usage: fleet-rules-rerun.sh <run_id>   (env: GH_READ_TOKEN, GH_TOKEN, REPOSITORY)
# The jobs lookup is a read and runs on GH_READ_TOKEN (the CI App installation token); it is
# skipped, never run on github.token, when none is given. Only the rerun POST uses GH_TOKEN.
# A github-quota deferral (exit 75) is infrastructure, never a verdict on any change, and
# used to end the re-run hop red with nothing re-run (run 40160088831, 2026-10-25: this
# script's jobs lookup deferred 19 minutes to the next reset on the then-shared github.token
# bucket). This script absorbs its own deferrals: it prints a never-a-verdict notice and
# exits 0 having re-run nothing — the hop stays green. A lone PR Ready deferral is
# retried once after the log's advertised reset by the fix-red quota route. The
# quota-deferred-heads doctor remains the PR Fleet Rules backstop. A rerun POST that loses a re-run race (HTTP
# 409) is done, not a failure: this script runs from both the hop and the evidence job's
# tail, and both can re-run the same failed run for one head (run 41248056847, 2026-10-31:
# the hop exited 1 having re-run nothing after a failed POST); the loser's POST 409s while
# the re-run still happens. Real errors stay red.
set -euo pipefail
API_CLIENT="${API_CLIENT:-packages/api-client/cli.ts}"
ghx() { local priority="$1"; shift; node "$API_CLIENT" gh --priority "$priority" -- "$@"; }
run_id="${1:-}"
[[ "$run_id" =~ ^[1-9][0-9]*$ ]] || exit 0
if [ -z "${GH_READ_TOKEN:-}" ]; then
  echo "::notice::No CI App read token; not looking up run $run_id (never falls back to github.token)."
  exit 0
fi
# deferred_exit: absorb a quota deferral as a green no-op; the deferral warning from the
# api client has already reached stderr. Never a pass: nothing is re-run.
deferred_exit() {
  echo "::notice::github-quota-deferred; fleet-rules-rerun made no decision and re-ran nothing (quota/outage, never a verdict on this change). The fix-red quota route reruns a lone PR Ready once after the advertised reset. The quota-deferred-heads doctor remains the PR Fleet Rules backstop."
  exit 0
}

lookup_rc=0
only_ready="$(GH_TOKEN="$GH_READ_TOKEN" ghx repair api "repos/$REPOSITORY/actions/runs/$run_id/jobs?filter=latest&per_page=100" \
  --jq '[.jobs[] | select(.conclusion == "failure") | .name] | length > 0 and all(. == "PR Ready")')" || lookup_rc=$?
if [ "$lookup_rc" -eq 75 ]; then
  deferred_exit
elif [ "$lookup_rc" -ne 0 ]; then
  exit "$lookup_rc"
fi
if [ "$only_ready" = true ]; then
  err="$(mktemp)"
  rc=0
  ghx repair api -X POST "repos/$REPOSITORY/actions/runs/$run_id/rerun-failed-jobs" >/dev/null 2>"$err" || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "Re-ran PR Ready for Source Validation run $run_id."
  elif [ "$rc" -eq 75 ]; then
    cat "$err" >&2
    rm -f "$err"
    deferred_exit
  elif grep -q "HTTP 409" "$err"; then
    echo "::notice::run $run_id was already being re-run elsewhere (HTTP 409); the other re-run owns it."
  else
    cat "$err" >&2
    rm -f "$err"
    exit 1
  fi
  rm -f "$err"
else
  echo "Run $run_id has other failures; not re-running."
fi
