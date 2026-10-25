#!/usr/bin/env bash
# Re-run a Source Validation run's failed jobs, but only when PR Ready is the
# sole failure (it failed only because the fleet verdict was missing/stale).
# Re-running real failures for an author would just burn CI. Bounded by attempt.
# Usage: fleet-rules-rerun.sh <run_id>   (env: GH_TOKEN, REPOSITORY)
set -euo pipefail
API_CLIENT="${API_CLIENT:-packages/api-client/cli.ts}"
ghx() { local priority="$1"; shift; node "$API_CLIENT" gh --priority "$priority" -- "$@"; }
run_id="${1:-}"
[[ "$run_id" =~ ^[1-9][0-9]*$ ]] || exit 0
only_ready="$(ghx repair api "repos/$REPOSITORY/actions/runs/$run_id/jobs?filter=latest&per_page=100" \
  --jq '[.jobs[] | select(.conclusion == "failure") | .name] | length > 0 and all(. == "PR Ready")')"
if [ "$only_ready" = true ]; then
  ghx repair api -X POST "repos/$REPOSITORY/actions/runs/$run_id/rerun-failed-jobs" >/dev/null \
    && echo "Re-ran PR Ready for Source Validation run $run_id."
else
  echo "Run $run_id has other failures; not re-running."
fi
