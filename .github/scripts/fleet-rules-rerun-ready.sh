#!/usr/bin/env bash
# Re-run PR Ready for the PR a *completed* Fleet Rules Evidence run belongs to.
# The in-job re-run in fleet-rules-verdict.sh fires while the evidence run is
# still in_progress, so PR Ready reads "not complete" again and nothing wakes it
# (#24184, 2026-11-01: 7 failed attempts). This runs from the workflow_run hop
# after the evidence run completed. The run's head_sha is the BASE sha for
# `edited` events, so the PR is resolved from the run title, never the sha.
# Usage: fleet-rules-rerun-ready.sh   (env: RUN_TITLE, REPOSITORY, GH_READ_TOKEN, GH_TOKEN)
set -euo pipefail
API_CLIENT="${API_CLIENT:-packages/api-client/cli.ts}"
ghx() { local priority="$1"; shift; node "$API_CLIENT" gh --priority "$priority" -- "$@"; }
if [[ ! "${RUN_TITLE:-}" =~ ^fleet-rules\ \#([1-9][0-9]*)\ base=main$ ]]; then
  echo "Not a PR evidence run title; nothing to re-run."; exit 0
fi
pr="${BASH_REMATCH[1]}"
if [ -z "${GH_READ_TOKEN:-}" ]; then
  echo "::notice::No CI App read token; not looking up PR #$pr (never falls back to github.token)."; exit 0
fi
head_sha="$(GH_TOKEN="$GH_READ_TOKEN" ghx repair api "repos/$REPOSITORY/pulls/$pr" --jq '.head.sha')"
[[ "$head_sha" =~ ^[0-9a-f]{40}$ ]] || { echo "No head sha for PR #$pr."; exit 0; }
run_id="$(GH_TOKEN="$GH_READ_TOKEN" ghx repair api "repos/$REPOSITORY/actions/workflows/source-validation.yml/runs?head_sha=$head_sha&event=pull_request&status=completed&per_page=10" \
  --jq '[.workflow_runs[]] | sort_by([.created_at, .id]) | last | select(.conclusion == "failure" and .run_attempt < 4) | .id // empty')"
[ -n "$run_id" ] || { echo "Latest Source Validation run for PR #$pr head is not a re-runnable failure."; exit 0; }
exec bash .github/scripts/fleet-rules-rerun.sh "$run_id"
