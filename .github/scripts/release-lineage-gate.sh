#!/usr/bin/env bash
# Forward-only release lineage with a starvation bound.
#
# Called by the Production Controller when main has advanced past the SHA that
# holds the production-mutation lease. It decides whether this generation keeps
# the lease (decision=proceed) or yields it (decision=yield):
#
#   diverged  main was rewound or force-pushed past this SHA      -> yield
#   ancestor  a newer generation is already queued in the FIFO    -> yield,
#             even past the PRODUCTION_STARVATION_SECONDS bound —
#             a queued generation costs seconds to yield, so a stale
#             backlog drains to the newest queued generation instead
#             of every stale generation running the full pipeline
#   ancestor  newer generation queued, but this generation is already
#             IN_FLIGHT past coalescing and production is starving    -> proceed
#             (the bound still guarantees a ship under perpetual merges)
#   ancestor  no newer generation is queued yet                    -> proceed
#
# Yielding only to a generation that already exists keeps the FIFO draining
# faster than merges arrive; the starvation bound keeps an in-flight
# generation from yielding forever. 2026-09-26: exact-SHA yields at every
# boundary left jov.ie 611 commits behind main while every generation was
# superseded mid-pipeline. 2026-09-29: letting queued ancestors keep the
# lease under starvation shipped every stale generation FIFO (78 queued,
# ~15h behind); the bound now applies only to generations already in flight.
set -euo pipefail

expected="${EXPECTED_SHA:?EXPECTED_SHA is required}"
current="${CURRENT_MAIN_SHA:?CURRENT_MAIN_SHA is required}"
repository="${REPOSITORY:-${GITHUB_REPOSITORY:-}}"
run_id="${GITHUB_RUN_ID:-0}"
boundary="${BOUNDARY:-release lineage}"
# IN_FLIGHT=true marks boundaries reached after this generation committed
# pipeline work (past coalescing). Only there does the starvation bound keep
# the lease despite a queued successor; a still-queued generation always
# drains to the newest queued generation.
in_flight="${IN_FLIGHT:-false}"
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
  # Unknown visibility must not become an empty-queue decision, including
  # under starvation. Emit bounded diagnostics without raw API response text.
  lookup_status=0
  runs_json="$("$gh_cli" api "repos/$repository/actions/workflows/production-controller.yml/runs?branch=main&event=workflow_run&per_page=30" 2>/dev/null)" || lookup_status=$?
  if [ "$lookup_status" -ne 0 ] || ! pending="$(jq -er --argjson run "$run_id" '
    if (.workflow_runs | type) != "array" or
      any(.workflow_runs[]; (.id | type) != "number" or .id <= 0 or
        (.status | type) != "string" or (.status | length) == 0)
    then error("invalid workflow run listing")
    else [.workflow_runs[] | select(.status != "completed" and .id > $run)] | length end
  ' <<<"$runs_json" 2>/dev/null)"; then
    emit lineage "$lineage"
    emit successor_pending unknown
    emit successor_lookup_exit "$lookup_status"
    emit starving unknown
    emit gate_decision error
    emit gate_reason successor_lookup_unavailable
    echo "::error::Release successor lookup is unknown (exit=$lookup_status); inspect Actions run-list access/response before admission." >&2
    printf 'decision=error\n'
    exit 1
  fi
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
  elif [ "$starving" = true ] && [ "$in_flight" = true ]; then
    reason="production is starving ($starve_detail); in-flight ancestor $expected keeps the lease despite $pending queued successor(s)"
  elif [ "$starving" = true ]; then
    reason="production is starving ($starve_detail); queued ancestor $expected drains to the newest of $pending queued successor(s)"
  else
    reason="$pending newer generation(s) already queued behind $expected; yielding the lease"
  fi
fi

decision=yield
if [ "$lineage" = exact ]; then
  decision=proceed
elif [ "$lineage" = ancestor ] && { [ "$successor_pending" = false ] || { [ "$starving" = true ] && [ "$in_flight" = true ]; }; }; then
  decision=proceed
fi

emit lineage "$lineage"
emit successor_pending "$successor_pending"
emit starving "$starving"
emit in_flight "$in_flight"
emit live_sha "$live_sha"
emit unshipped_commits "$unshipped_commits"
emit unshipped_age_seconds "$unshipped_age_seconds"
emit gate_decision "$decision"
emit gate_reason "$reason"
echo "::notice::Release lineage gate $boundary: decision=$decision lineage=$lineage successor_pending=$successor_pending starving=$starving unshipped=$unshipped_commits age=${unshipped_age_seconds}s reason=\"$reason\"" >&2
printf 'decision=%s\n' "$decision"
