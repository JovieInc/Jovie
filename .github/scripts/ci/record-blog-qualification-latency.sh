#!/usr/bin/env bash
set -euo pipefail
root="$RUNNER_TEMP/blog-content-qualification"
started_at=$(cat "$root/qualification-started-at.txt")
started_epoch=$(cat "$root/qualification-started-epoch.txt")
ended_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
ended_epoch=$(date +%s)
candidate_created_at=$(git show -s --format=%cI "$GITHUB_SHA")
jq -n \
  --arg candidate_sha "$GITHUB_SHA" \
  --arg candidate_created_at "$candidate_created_at" \
  --arg qualification_started_at "$started_at" \
  --arg qualification_ended_at "$ended_at" \
  --argjson selected_checks "$SELECTED_CHECKS" \
  --argjson retries "$((GITHUB_RUN_ATTEMPT - 1))" \
  --argjson runner_seconds "$((ended_epoch - started_epoch))" \
  --argjson build_seconds "$BUILD_SECONDS" \
  --arg run_url "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID" \
  --slurpfile classification "$root/blog-content-receipt.json" \
  '{schema:"jovie-blog-content-qualification/v1",candidateSha:$candidate_sha,candidateCreatedAt:$candidate_created_at,qualificationStartedAt:$qualification_started_at,qualificationEndedAt:$qualification_ended_at,queueEnteredAt:null,queueWaitSeconds:null,deployedAt:null,confirmedLiveAt:null,selectedChecks:$selected_checks,retries:$retries,cost:{runnerSeconds:$runner_seconds,buildSeconds:$build_seconds},runUrl:$run_url,classification:$classification[0]}' \
  > "$root/qualification-receipt.json"
cat "$root/qualification-receipt.json" >> "$GITHUB_STEP_SUMMARY"
