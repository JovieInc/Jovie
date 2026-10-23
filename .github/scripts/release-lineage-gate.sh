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

# Returns 1 (shippable) unless the successor provably cannot ship, setting
# successor_skip_reason. Production Controller run names are
# "Production Controller <staging run name>"; staging run names are
# "<sha> from CI <id> attempt <n>".
successor_scan_limit="${SUCCESSOR_SCAN_LIMIT:-10}"
successor_skip_reason=""
successor_shippable() {
  local title="$1" staging_title staging_run staging_id staging_attempt artifact_id outcome zip
  successor_skip_reason=""
  [[ "$title" =~ ^Production\ Controller\ ([0-9a-f]{40})\ from\ CI\ [1-9][0-9]*\ attempt\ [1-9][0-9]*$ ]] || return 0
  local successor_sha="${BASH_REMATCH[1]}"
  staging_title="${title#Production Controller }"
  if [ -z "$staging_runs_json" ]; then
    staging_runs_json="$("$gh_cli" api "repos/$repository/actions/workflows/staging-controller.yml/runs?branch=main&event=workflow_run&per_page=50" 2>/dev/null)" || {
      staging_runs_json='{"workflow_runs":[]}'
      return 0
    }
  fi
  staging_run="$(jq -c --arg title "$staging_title" '
    [(.workflow_runs // [])[] | select(.display_title == $title and .status == "completed")]
    | if length == 1 then .[0] else empty end
  ' <<<"$staging_runs_json" 2>/dev/null || true)"
  [ -n "$staging_run" ] || return 0
  if [ "$(jq -r '.conclusion' <<<"$staging_run")" != success ]; then
    successor_skip_reason="staging $(jq -r '.id' <<<"$staging_run") concluded $(jq -r '.conclusion' <<<"$staging_run")"
    return 1
  fi
  staging_id="$(jq -r '.id' <<<"$staging_run")"
  staging_attempt="$(jq -r '.run_attempt' <<<"$staging_run")"
  [[ "$staging_id" =~ ^[1-9][0-9]*$ && "$staging_attempt" =~ ^[1-9][0-9]*$ ]] || return 0
  artifact_id="$("$gh_cli" api "repos/$repository/actions/runs/$staging_id/artifacts?per_page=100" 2>/dev/null |
    jq -r --arg name "staging-completion-$staging_attempt" '
      [(.artifacts // [])[] | select(.name == $name and .expired == false)]
      | if length == 1 then .[0].id else empty end
    ' 2>/dev/null || true)"
  [[ "$artifact_id" =~ ^[1-9][0-9]*$ ]] || return 0
  zip="$(mktemp)"
  if "$gh_cli" api "repos/$repository/actions/artifacts/$artifact_id/zip" >"$zip" 2>/dev/null; then
    outcome="$(unzip -p "$zip" staging-completion.json 2>/dev/null |
      jq -r --arg sha "$successor_sha" 'if .sha == $sha then .outcome else empty end' 2>/dev/null || true)"
  else
    outcome=""
  fi
  rm -f "$zip"
  if [ "$outcome" = superseded ]; then
    successor_skip_reason="staging $staging_id finished superseded"
    return 1
  fi
  return 0
}

iso_to_epoch() {
  date -u -d "$1" +%s 2>/dev/null || date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$1" +%s
}

# Bounded REST retry. Stderr is classified and discarded: a rate-limit body
# can carry an installation id, and a raw body must not become a log line.
# gh_retry_status / gh_retry_class survive for the caller. A completed HTTP
# success (including an empty or unexpected status) returns 0 and is not retried.
gh_retry_status=0
gh_retry_class=""
gh_retry() {
  local label="$1"
  shift
  local attempt=1 max backoff err text http
  max="${LINEAGE_COMPARE_ATTEMPTS:-3}"
  backoff="${LINEAGE_COMPARE_BACKOFF_SECONDS:-2}"
  [[ "$max" =~ ^[1-9][0-9]*$ ]] || max=3
  [[ "$backoff" =~ ^[0-9]+$ ]] || backoff=2
  while [ "$attempt" -le "$max" ]; do
    err="$(mktemp)"
    gh_retry_status=0
    gh_retry_class=""
    text="$("$gh_cli" "$@" 2>"$err")" || gh_retry_status=$?
    if [ "$gh_retry_status" -eq 0 ]; then
      rm -f "$err"
      printf '%s\n' "$text"
      return 0
    fi
    text="$(cat "$err" 2>/dev/null || true)"
    rm -f "$err"
    gh_retry_class=transport
    http=""
    if printf '%s\n' "$text" | grep -qiE 'secondary rate limit|API rate limit|rate limit exceeded'; then
      gh_retry_class=rate_limit
    fi
    if [[ "$text" =~ HTTP[^0-9]*([0-9]{3}) ]]; then
      http="${BASH_REMATCH[1]}"
    fi
    if [ "$gh_retry_class" != rate_limit ] && [ "$http" = 429 ]; then
      gh_retry_class=rate_limit
    elif [ -n "$http" ] && [ "$gh_retry_class" = transport ]; then
      gh_retry_class="http_${http}"
    fi
    echo "::warning::${label} attempt ${attempt}/${max} class=${gh_retry_class} http=${http:-none} exit=${gh_retry_status}." >&2
    if [ "$attempt" -ge "$max" ]; then
      return 1
    fi
    if [ "$backoff" -gt 0 ]; then
      sleep "$backoff"
      backoff=$((backoff * 2))
    fi
    attempt=$((attempt + 1))
  done
  return 1
}

# Git does not spend the shared installation REST quota. Used only after the
# compare command itself failed. A 200 with an empty or unexpected status is
# not overridden: that completed read stays unknown (JOV-7674). A missing
# object stays unknown rather than diverged.
prove_git_lineage() {
  [ "${LINEAGE_PROVE_WITH_GIT:-1}" = 1 ] || return 1
  local work tip token header url
  work="$(mktemp -d)"
  url="https://github.com/${repository}.git"
  git_auth() {
    if [ -n "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]; then
      token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
      header="$(printf 'x-access-token:%s' "$token" | base64 | tr -d '\n')"
      printf '::add-mask::%s\n' "$header" >&2
      GIT_CONFIG_COUNT=2 \
        GIT_CONFIG_KEY_0="http.https://github.com/.extraheader" \
        GIT_CONFIG_VALUE_0="AUTHORIZATION: basic ${header}" \
        GIT_CONFIG_KEY_1=core.hooksPath \
        GIT_CONFIG_VALUE_1=/dev/null \
        GIT_TERMINAL_PROMPT=0 \
        git "$@"
      return
    fi
    GIT_TERMINAL_PROMPT=0 git "$@"
  }
  git_auth init -q "$work" || {
    rm -rf "$work"
    return 1
  }
  for depth in 128 2048; do
    if ! git_auth -C "$work" fetch --no-tags --filter=blob:none --depth="$depth" \
      "$url" 'refs/heads/main:refs/heads/main'; then
      rm -rf "$work"
      return 1
    fi
    tip="$(git -C "$work" rev-parse refs/heads/main 2>/dev/null || true)"
    if [ "$tip" != "$current" ]; then
      echo "::warning::git main tip does not match the resolved main SHA; refusing the git lineage proof." >&2
      rm -rf "$work"
      return 1
    fi
    if git -C "$work" cat-file -e "${expected}^{commit}" 2>/dev/null; then
      if git -C "$work" merge-base --is-ancestor "$expected" "$tip"; then
        rm -rf "$work"
        printf 'ahead\n'
        return 0
      fi
      rm -rf "$work"
      printf 'diverged\n'
      return 0
    fi
  done
  rm -rf "$work"
  return 1
}

lineage=exact
compare_error_class=""
if [ "$current" != "$expected" ]; then
  lookup_status=0
  lineage=unknown
  # Redirect instead of $(...): a command substitution runs the function in a
  # subshell and would drop gh_retry_status.
  compare_out="$(mktemp)"
  if gh_retry "Release compare" api "repos/$repository/compare/${expected}...${current}" --jq '.status // empty' >"$compare_out"; then
    status="$(cat "$compare_out")"
    case "$status" in
      ahead) lineage=ancestor ;;
      behind|diverged) lineage=diverged ;;
    esac
  else
    lookup_status="$gh_retry_status"
    compare_error_class="${gh_retry_class:-transport}"
    # 2026-10-23 03:52Z: installation REST quota was exhausted. The compare
    # exited 1 while both SHAs were ancestors of main. Git still proved the
    # tip (resolve-main-sha uses ls-remote). A failed command may be proven
    # that way. An unproven read still fails closed.
    if git_status="$(prove_git_lineage)"; then
      case "$git_status" in
        ahead) lineage=ancestor ;;
        behind|diverged) lineage=diverged ;;
      esac
      if [ "$lineage" != unknown ]; then
        echo "::warning::REST compare unavailable class=${compare_error_class} exit=${lookup_status}; git proved lineage=${lineage}." >&2
      fi
    fi
  fi
  rm -f "$compare_out"
  # A failed or unexpected compare proves no rewrite. Installation quota
  # exhaustion must still fail a mutating promotion (JOV-7674). The coalesce
  # caller, which has not mutated, turns this decision=error into a yield
  # receipt so an older generation does not fail the wave.
  if [ "$lineage" = unknown ]; then
    emit lineage unknown
    emit lineage_lookup_exit "$lookup_status"
    emit lineage_lookup_class "${compare_error_class:-none}"
    emit gate_decision error
    emit gate_reason lineage_lookup_unavailable
    echo "::error::Release ancestry is unknown (exit=${lookup_status} class=${compare_error_class:-none}); inspect GitHub compare access/response before superseding $expected." >&2
    printf 'decision=error\n'
    exit 1
  fi
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
  runs_out="$(mktemp)"
  if gh_retry "Release successor lookup" api "repos/$repository/actions/workflows/production-controller.yml/runs?branch=main&event=workflow_run&per_page=30" >"$runs_out"; then
    runs_json="$(cat "$runs_out")"
  else
    lookup_status="$gh_retry_status"
    runs_json=""
  fi
  rm -f "$runs_out"
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
  # Only a successor that can ship counts. A queued controller generation
  # whose staging run failed or finished `superseded` skips at release-source
  # and never promotes; yielding to it strands production. 2026-10-20: 826b00a
  # (staging deployed) yielded to four queued generations whose staging was
  # superseded by a397d64, whose staging then failed, so nothing shipped.
  # Newest first; stop at the first shippable one. Unknown evidence keeps the
  # conservative yield.
  skipped_successors=0
  staging_runs_json=""
  while IFS=$'\t' read -r successor_id successor_title; do
    [ -n "$successor_id" ] || continue
    if [ "$skipped_successors" -ge "$successor_scan_limit" ] ||
      successor_shippable "$successor_title"; then
      successor_pending=true
      break
    fi
    skipped_successors=$((skipped_successors + 1))
    echo "::notice::Queued controller run $successor_id cannot ship ($successor_skip_reason); not yielding to it." >&2
  done < <(jq -r --argjson run "$run_id" '
    [.workflow_runs[] | select(.status != "completed" and .id > $run)]
    | sort_by(.id) | reverse[] | [.id, (.display_title // "")] | @tsv
  ' <<<"$runs_json")

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
  if [ "$successor_pending" = false ] && [ "$pending" -gt 0 ]; then
    reason="$reason ($skipped_successors queued successor(s) cannot ship)"
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
emit skipped_successors "${skipped_successors:-0}"
emit live_sha "$live_sha"
emit unshipped_commits "$unshipped_commits"
emit unshipped_age_seconds "$unshipped_age_seconds"
emit gate_decision "$decision"
emit gate_reason "$reason"
echo "::notice::Release lineage gate $boundary: decision=$decision lineage=$lineage successor_pending=$successor_pending starving=$starving unshipped=$unshipped_commits age=${unshipped_age_seconds}s reason=\"$reason\"" >&2
printf 'decision=%s\n' "$decision"
