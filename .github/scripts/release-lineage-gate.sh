#!/usr/bin/env bash
# Forward-only release lineage with a starvation bound.
#
# Called by the Production Controller when main has advanced past the SHA that
# holds the production-mutation lease. It decides whether this generation keeps
# the lease (decision=proceed) or yields it (decision=yield):
#
#   diverged  main was rewound or force-pushed past this SHA      -> yield
#   ancestor  a newer generation is already queued in the FIFO    -> yield,
#             unless main has carried unshipped commits for longer than
#             PRODUCTION_STARVATION_SECONDS                          -> proceed
#   ancestor  no newer generation is queued yet                    -> proceed
#
# Yielding only to a generation that already exists keeps the FIFO draining
# faster than merges arrive; the time bound guarantees progress even if it
# does not. 2026-09-26: exact-SHA yields at every boundary left jov.ie 611
# commits behind main while every generation was superseded mid-pipeline.
set -euo pipefail

expected="${EXPECTED_SHA:?EXPECTED_SHA is required}"
current="${CURRENT_MAIN_SHA:?CURRENT_MAIN_SHA is required}"
repository="${REPOSITORY:-${GITHUB_REPOSITORY:-}}"
run_id="${GITHUB_RUN_ID:-0}"
boundary="${BOUNDARY:-release lineage}"
build_info_url="${PRODUCTION_BUILD_INFO_URL:-https://jov.ie/api/health/build-info}"
starvation_seconds="${PRODUCTION_STARVATION_SECONDS:-5400}"
gh_cli="${GH_CLI:-gh}"

[[ "$expected" =~ ^[0-9a-f]{40}$ && "$current" =~ ^[0-9a-f]{40}$ ]] || {
  echo "::error::release-lineage-gate needs full commit SHAs." >&2
  exit 1
}
[[ "$repository" =~ ^[^/]+/[^/]+$ ]] || {
  echo "::error::release-lineage-gate needs REPOSITORY as owner/name." >&2
  exit 1
}
[[ "$run_id" =~ ^[0-9]+$ && "$starvation_seconds" =~ ^[0-9]+$ ]] || {
  echo "::error::release-lineage-gate needs numeric GITHUB_RUN_ID and PRODUCTION_STARVATION_SECONDS." >&2
  exit 1
}

emit() {
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf '%s=%s\n' "$1" "$2" >> "$GITHUB_OUTPUT"
  fi
}

iso_to_epoch() {
  date -u -d "$1" +%s 2>/dev/null || date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$1" +%s
}

lineage=exact
if [ "$current" != "$expected" ]; then
  status="$("$gh_cli" api "repos/$repository/compare/${expected}...${current}" --jq '.status // empty' 2>/dev/null || true)"
  case "$status" in
    ahead) lineage=ancestor ;;
    *) lineage=diverged ;;
  esac
fi

successor_pending=false
starving=false
unshipped_commits=0
unshipped_age_seconds=0
live_sha=""
reason="exact SHA is current"

if [ "$lineage" = diverged ]; then
  reason="$expected left main's lineage (main is $current)"
elif [ "$lineage" = ancestor ]; then
  # A newer generation already waiting on the production-mutation lease will
  # ship a SHA closer to main; yield to it rather than build a stale one.
  runs_json="$("$gh_cli" api "repos/$repository/actions/workflows/production-controller.yml/runs?branch=main&event=workflow_run&per_page=30" 2>/dev/null || true)"
  pending="$(jq -r --argjson run "$run_id" \
    '[(.workflow_runs // [])[] | select(.status != "completed" and .id > $run)] | length' \
    <<<"${runs_json:-{\}}" 2>/dev/null || echo 0)"
  [[ "$pending" =~ ^[0-9]+$ ]] || pending=0
  if [ "$pending" -gt 0 ]; then
    successor_pending=true
  fi

  # Starvation bound: how long has main carried commits production lacks?
  build_info="$(curl --fail --silent --connect-timeout 5 --max-time 15 \
    -H 'Cache-Control: no-cache' "$build_info_url" 2>/dev/null || true)"
  live_sha="$(jq -r '.commitSha // empty' <<<"${build_info:-{\}}" 2>/dev/null || true)"
  if [[ ! "$live_sha" =~ ^[0-9a-f]{40}$ ]]; then
    live_sha=""
    starving=true
    starve_detail="live production build-info is unreadable"
  else
    compare_json="$("$gh_cli" api "repos/$repository/compare/${live_sha}...${current}" 2>/dev/null || true)"
    unshipped_commits="$(jq -r '.ahead_by // empty' <<<"${compare_json:-{\}}" 2>/dev/null || true)"
    oldest="$(jq -r '.commits[0].commit.committer.date // empty' <<<"${compare_json:-{\}}" 2>/dev/null || true)"
    if [[ ! "$unshipped_commits" =~ ^[0-9]+$ ]]; then
      unshipped_commits=0
      starving=true
      starve_detail="the unshipped range behind production is unreadable"
    elif [ "$unshipped_commits" -gt 0 ] && [ -n "$oldest" ]; then
      unshipped_age_seconds=$(( $(date -u +%s) - $(iso_to_epoch "$oldest") ))
      if [ "$unshipped_age_seconds" -ge "$starvation_seconds" ]; then
        starving=true
        starve_detail="main has carried $unshipped_commits unshipped commit(s) for ${unshipped_age_seconds}s (bound ${starvation_seconds}s)"
      fi
    fi
  fi

  if [ "$successor_pending" = false ]; then
    reason="main advanced to $current but no newer generation is queued; ancestor $expected keeps the lease"
  elif [ "$starving" = true ]; then
    reason="production is starving ($starve_detail); ancestor $expected keeps the lease despite $pending queued successor(s)"
  else
    reason="$pending newer generation(s) already queued behind $expected; yielding the lease"
  fi
fi

decision=yield
if [ "$lineage" = exact ]; then
  decision=proceed
elif [ "$lineage" = ancestor ] && { [ "$successor_pending" = false ] || [ "$starving" = true ]; }; then
  decision=proceed
fi

emit lineage "$lineage"
emit successor_pending "$successor_pending"
emit starving "$starving"
emit live_sha "$live_sha"
emit unshipped_commits "$unshipped_commits"
emit unshipped_age_seconds "$unshipped_age_seconds"
emit gate_decision "$decision"
emit gate_reason "$reason"
echo "::notice::Release lineage gate $boundary: decision=$decision lineage=$lineage successor_pending=$successor_pending starving=$starving unshipped=$unshipped_commits age=${unshipped_age_seconds}s reason=\"$reason\"" >&2
printf 'decision=%s\n' "$decision"
