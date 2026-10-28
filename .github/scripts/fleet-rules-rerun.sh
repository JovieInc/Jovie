#!/usr/bin/env bash
# Re-run a Source Validation run's failed jobs, but only when PR Ready is the
# sole failure (it failed only because the fleet verdict was missing/stale).
# Re-running real failures for an author would just burn CI. Bounded by attempt.
# Usage: fleet-rules-rerun.sh <run_id>   (env: GH_READ_TOKEN, GH_TOKEN, REPOSITORY)
# The jobs lookup is a read and runs on GH_READ_TOKEN (the CI App installation token); it is
# skipped, never run on github.token, when none is given. Only the rerun POST uses GH_TOKEN.
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
  ghx repair api -X POST "repos/$REPOSITORY/actions/runs/$run_id/rerun-failed-jobs" >/dev/null \
    && echo "Re-ran PR Ready for Source Validation run $run_id."
else
  echo "Run $run_id has other failures; not re-running."
fi
