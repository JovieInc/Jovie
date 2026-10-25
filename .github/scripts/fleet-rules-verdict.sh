#!/usr/bin/env bash
# Run pr-fleet-rules.mjs on the dedicated CI App token (falling back to
# github.token) and publish the verdict as the "Fleet Rules Evidence" commit
# status on the exact PR head. Base-branch code only; never executes PR content.
# Exit 75 (quota/outage) posts state=error and is re-run by Source Validation's
# own deferral, never a pass. After a decisive verdict, the latest completed
# failed Source Validation run for this head is re-run so PR Ready re-reads it.
set -uo pipefail

[[ "${HEAD_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || { echo '::error::exact head sha required'; exit 1; }
out="$(mktemp)"
trap 'rm -f "$out"' EXIT

set +e
GITHUB_TOKEN="${FLEET_TOKEN:-$GH_TOKEN}" node scripts/pr-fleet-rules.mjs --with-warnings 2>&1 | tee "$out"
rc="${PIPESTATUS[0]}"
set -e

case "$rc" in
  0) state=success; description='Fleet rules passed' ;;
  75) state=error; description='github-quota-deferred: evidence unavailable, not a verdict' ;;
  *) state=failure
     description="$(sed -n 's/^::error:://p' "$out" | head -n1 | tr -d '\r' | cut -c1-130)"
     [ -n "$description" ] || description='Fleet rules failed' ;;
esac

gh api -X POST "repos/$REPOSITORY/statuses/$HEAD_SHA" \
  -f state="$state" -f context='Fleet Rules Evidence' \
  -f description="$description" -f target_url="$RUN_URL" >/dev/null

if [ "$state" != error ]; then
  run_id="$(gh api "repos/$REPOSITORY/actions/workflows/source-validation.yml/runs?head_sha=$HEAD_SHA&event=pull_request&status=completed&per_page=10" \
    --jq '[.workflow_runs[] | select(.conclusion == "failure" and .run_attempt < 4)] | sort_by(.created_at) | last | .id // empty' 2>/dev/null || true)"
  if [[ "$run_id" =~ ^[1-9][0-9]*$ ]]; then
    gh api -X POST "repos/$REPOSITORY/actions/runs/$run_id/rerun-failed-jobs" >/dev/null 2>&1 \
      && echo "Re-ran failed Source Validation run $run_id."
  fi
fi
# The job reports the read, not the policy verdict: the verdict is the status.
[ "$state" = error ] && exit 75
exit 0
