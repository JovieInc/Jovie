#!/usr/bin/env bash
# Mac runner watch. Runs on Gem (always on) from a systemd user timer, because
# the Macs sleep and GitHub cron fires every 4-6h. Org rule: nothing is held on
# the self-hosted Macs being offline (.claude/rules/infra.md).
#
# 1. Dispatches each repo's Mac heartbeat. A sleeping or busy Mac leaves the
#    probe queued, which mac-runner-route reads as down, so new jobs go hosted.
# 2. Rescues first-attempt jobs stuck queued on jovie-mac labels (a Mac that
#    slept after a fresh probe): force-cancel and rerun the whole run.
#    mac-runner-route only picks the Macs on run attempt 1, so the rerun is
#    hosted.
set -uo pipefail

REPOS="${MAC_WATCH_REPOS:-JovieInc/Jovie JovieInc/LogYourBody}"
WORKFLOWS="${MAC_WATCH_WORKFLOWS:-ci.yml ios-ci.yml npm-publish.yml ios-app-store-graphics.yml}"
STUCK_SECONDS="${MAC_WATCH_STUCK_SECONDS:-480}"
CANCEL_WAIT_SECONDS="${MAC_WATCH_CANCEL_WAIT_SECONDS:-60}"

# shellcheck disable=SC2086 # WORKFLOWS is a space-separated list.
paths_json="$(printf '%s\n' $WORKFLOWS | sed 's|^|.github/workflows/|' | jq -R . | jq -sc .)"
cutoff="$(($(date +%s) - STUCK_SECONDS))"

# shellcheck disable=SC2086 # REPOS is a space-separated list.
for repo in $REPOS; do
  gh workflow run mac-runner-heartbeat.yml -R "$repo" --ref main >/dev/null ||
    echo "mac-runner-watch: heartbeat dispatch failed for $repo" >&2

  runs="$(
    for status in queued in_progress; do
      gh api "repos/$repo/actions/runs?status=$status&per_page=100" --jq \
        ".workflow_runs[] | select(.run_attempt == 1 and (.path as \$p | $paths_json | index(\$p)) and (.created_at | fromdateiso8601) < $cutoff) | .id"
    done | sort -u
  )" || continue

  for run in $runs; do
    stuck="$(gh api "repos/$repo/actions/runs/$run/jobs?per_page=100" --jq \
      "[.jobs[] | select(.status == \"queued\" and (.runner_name // \"\") == \"\" and (.labels | index(\"jovie-mac\")) and (.created_at | fromdateiso8601) < $cutoff)] | length")" || continue
    [ "${stuck:-0}" -gt 0 ] || continue

    echo "mac-runner-watch: $repo run $run has $stuck job(s) stuck on jovie-mac; rerouting to hosted"
    gh api -X POST "repos/$repo/actions/runs/$run/force-cancel" >/dev/null || continue
    deadline="$(($(date +%s) + CANCEL_WAIT_SECONDS))"
    while [ "$(gh api "repos/$repo/actions/runs/$run" --jq .status)" != completed ]; do
      [ "$(date +%s)" -lt "$deadline" ] || break
      sleep 5
    done
    gh run rerun "$run" -R "$repo" >/dev/null ||
      echo "mac-runner-watch: rerun failed for $repo run $run" >&2
  done
done
