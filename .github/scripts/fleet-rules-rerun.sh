#!/usr/bin/env bash
# Re-run a Source Validation run's failed jobs, but only when PR Ready is the
# sole failure (it failed only because the fleet verdict was missing/stale).
# Re-running real failures for an author would just burn CI. Bounded by attempt.
# Usage: fleet-rules-rerun.sh <run_id>   (env: GH_READ_TOKEN, GH_TOKEN, REPOSITORY)
# The jobs lookup is a read and runs on GH_READ_TOKEN (the CI App installation token); it is
# skipped, never run on github.token, when none is given. Only the rerun POST uses GH_TOKEN.
# A deferred lookup (exit 75) propagates to the caller: the hop ends it green having decided
# nothing, never a verdict. A rerun POST that loses a re-run race (HTTP 409) is done, not a
# failure: this script runs from both the hop and the evidence job's tail, and both can
# re-run the same failed run for one head; the loser's POST 409s while the re-run still happens.
set -euo pipefail
API_CLIENT="${API_CLIENT:-packages/api-client/cli.ts}"
ghx() { local priority="$1"; shift; node "$API_CLIENT" gh --priority "$priority" -- "$@"; }
run_id="${1:-}"
[[ "$run_id" =~ ^[1-9][0-9]*$ ]] || exit 0
if [ -z "${GH_READ_TOKEN:-}" ]; then
  echo "::notice::No CI App read token; not looking up run $run_id (never falls back to github.token)."
  exit 0
fi
only_ready="$(GH_TOKEN="$GH_READ_TOKEN" ghx repair api "repos/$REPOSITORY/actions/runs/$run_id/jobs?filter=latest&per_page=100" \
  --jq '[.jobs[] | select(.conclusion == "failure") | .name] | length > 0 and all(. == "PR Ready")')"
if [ "$only_ready" = true ]; then
  err="$(mktemp)"
  rc=0
  ghx repair api -X POST "repos/$REPOSITORY/actions/runs/$run_id/rerun-failed-jobs" >/dev/null 2>"$err" || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "Re-ran PR Ready for Source Validation run $run_id."
  elif [ "$rc" -eq 75 ]; then
    cat "$err" >&2
    rm -f "$err"
    exit 75
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
