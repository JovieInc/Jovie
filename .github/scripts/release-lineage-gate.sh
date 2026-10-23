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

# One log line. Workflow commands treat % as an escape, so drop it.
one_line() {
  local text
  text="$(printf '%s' "$1" | tr '\r\n%' '   ')"
  printf '%s' "${text:0:240}"
}

# Git protocol does not spend the Actions installation REST budget. Same
# auth shape as resolve-main-sha.sh. An empty token fetches anonymously.
git_authenticated() {
  if [ -n "${GH_TOKEN:-}" ]; then
    local basic
    basic="$(printf 'x-access-token:%s' "$GH_TOKEN" | base64 | tr -d '\n')"
    printf '::add-mask::%s\n' "$basic" >&2
    GIT_CONFIG_COUNT=2 \
      GIT_CONFIG_KEY_0=http.https://github.com/.extraheader \
      GIT_CONFIG_VALUE_0="AUTHORIZATION: basic ${basic}" \
      GIT_CONFIG_KEY_1=core.hooksPath \
      GIT_CONFIG_VALUE_1=/dev/null \
      GIT_TERMINAL_PROMPT=0 \
      GCM_INTERACTIVE=never \
      git "$@"
    return
  fi
  GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never git "$@"
}

# Read one compare response. Sets compare_exit, compare_http,
# compare_retry_after, compare_remaining, compare_reset, compare_detail.
# Does not treat an error body's "status" field as ancestry: a 403 payload
# can contain "status":"404" or any other word (JOV-7674).
read_compare_once() {
  local raw
  raw="$(mktemp)"
  compare_err="$(mktemp)"
  set +e
  "$gh_cli" api -i "repos/$repository/compare/${expected}...${current}" >"$raw" 2>"$compare_err"
  compare_exit=$?
  set -e
  compare_http="$(awk 'toupper($1) ~ /^HTTP/ { gsub(/\r/,"",$2); print $2; exit }' "$raw")"
  compare_retry_after="$(awk 'tolower($1)=="retry-after:" { gsub(/\r/,"",$2); print $2; exit }' "$raw")"
  compare_remaining="$(awk 'tolower($1)=="x-ratelimit-remaining:" { gsub(/\r/,"",$2); print $2; exit }' "$raw")"
  compare_reset="$(awk 'tolower($1)=="x-ratelimit-reset:" { gsub(/\r/,"",$2); print $2; exit }' "$raw")"
  compare_body="$(awk 'BEGIN{p=0} { sub(/\r/,"") } NF==0 { p=1; next } p { print }' "$raw")"
  if [ -z "${compare_http:-}" ]; then
    compare_http="$(awk 'match($0, /HTTP [0-9][0-9][0-9]/) { print substr($0, RSTART+5, 3); exit }' "$compare_err")"
  fi
  compare_detail="$(jq -r '.message // empty' <<<"${compare_body:-{\}}" 2>/dev/null || true)"
  if [ -z "$compare_detail" ]; then
    compare_detail="$(one_line "${compare_body:-}")"
  fi
  if [ -z "$compare_detail" ]; then
    compare_detail="$(one_line "$(cat "$compare_err" 2>/dev/null || true)")"
  else
    compare_detail="$(one_line "$compare_detail")"
  fi
  # A rate-limit body names the installation. Keep the class, drop the id.
  compare_detail="$(printf '%s\n' "$compare_detail" | sed -E 's/installation ID [0-9]+/installation/g')"
  rm -f "$raw" "$compare_err"
}

compare_retryable() {
  case "${compare_http:-}" in
    429|502|503|504) return 0 ;;
    "")
      if [ "${compare_exit:-1}" -ne 0 ]; then
        return 0
      fi
      return 1
      ;;
    403)
      if [ "${compare_remaining:-}" = "0" ]; then
        return 0
      fi
      if [[ "${compare_retry_after:-}" =~ ^[0-9]+$ ]]; then
        return 0
      fi
      if printf '%s\n' "$compare_detail" | grep -qiE 'rate limit|secondary rate|abuse detection'; then
        return 0
      fi
      return 1
      ;;
    *) return 1 ;;
  esac
}

# Seconds to wait before another REST attempt. Retry-After and a primary
# reset beat the exponential backoff. The caller refuses a wait past the cap
# instead of retrying early: an early retry makes a secondary limit worse.
compare_wait_seconds() {
  local wait_s="$compare_backoff" i=1 reset_wait now
  while [ "$i" -lt "$attempt" ]; do
    wait_s=$((wait_s * 2))
    i=$((i + 1))
  done
  if [[ "${compare_retry_after:-}" =~ ^[0-9]+$ ]]; then
    wait_s="$compare_retry_after"
  fi
  if [ "${compare_remaining:-}" = "0" ] && [[ "${compare_reset:-}" =~ ^[0-9]+$ ]]; then
    now="$(date +%s)"
    reset_wait=$((compare_reset - now + 1))
    if [ "$reset_wait" -lt 0 ]; then
      reset_wait=0
    fi
    if [ "$reset_wait" -gt "$wait_s" ]; then
      wait_s="$reset_wait"
    fi
  fi
  printf '%s\n' "$wait_s"
}

# Sets compare_status to ahead|behind|diverged on a classified HTTP 200.
# Retries only a transient failure whose wait fits in the cap. Returns 1
# when ancestry is still unproven; the caller may then use git.
rest_lineage_status() {
  local attempt=1 wait_s
  compare_attempts="${LINEAGE_COMPARE_ATTEMPTS:-4}"
  compare_backoff="${LINEAGE_COMPARE_BACKOFF_SECONDS:-2}"
  compare_max_sleep="${LINEAGE_COMPARE_MAX_SLEEP_SECONDS:-15}"
  [[ "$compare_attempts" =~ ^[1-9][0-9]*$ ]] || compare_attempts=4
  [[ "$compare_backoff" =~ ^[0-9]+$ ]] || compare_backoff=2
  [[ "$compare_max_sleep" =~ ^[0-9]+$ ]] || compare_max_sleep=15
  if [ "$compare_attempts" -gt 6 ]; then
    compare_attempts=6
  fi
  compare_status=""
  while [ "$attempt" -le "$compare_attempts" ]; do
    read_compare_once
    if [ "$compare_exit" -eq 0 ] && [ "$compare_http" = "200" ]; then
      compare_status="$(jq -r '.status // empty' <<<"${compare_body:-{\}}" 2>/dev/null || true)"
      case "$compare_status" in
        ahead|behind|diverged) return 0 ;;
      esac
      # A 200 that is not ahead/behind/diverged is not a transport error.
      # Retrying it cannot classify the pair. Git may still prove it.
      return 1
    fi
    if ! compare_retryable || [ "$attempt" -ge "$compare_attempts" ]; then
      return 1
    fi
    wait_s="$(compare_wait_seconds)"
    if [ "$wait_s" -gt "$compare_max_sleep" ]; then
      echo "::warning::GitHub compare HTTP ${compare_http:-none} requires ${wait_s}s, past the ${compare_max_sleep}s bound (response: ${compare_detail:-none}); proving ancestry with git." >&2
      return 1
    fi
    echo "::warning::GitHub compare attempt ${attempt} failed (exit=${compare_exit}, HTTP ${compare_http:-none}, response: ${compare_detail:-none}); retrying in ${wait_s}s." >&2
    sleep "$wait_s"
    attempt=$((attempt + 1))
  done
  return 1
}

# Echo ahead or diverged. Return 1 when git cannot prove the relationship.
# A shallow fetch that does not contain EXPECTED_SHA is unproven, not a
# rewrite: merge-base exit 1 counts as diverged only on a full history.
prove_lineage_with_git() {
  local current="$1" work depth tip ancestor_status shallow git_err_file fetch_err
  git_reason=""
  if ! command -v git >/dev/null 2>&1; then
    git_reason="git is not installed"
    return 1
  fi
  work="$(mktemp -d 2>/dev/null || true)"
  git_err_file="$(mktemp)"
  if [ -z "$work" ] || [ ! -d "$work" ]; then
    git_reason="git init failed"
    rm -f "$git_err_file"
    return 1
  fi
  if ! git init -q "$work" >/dev/null 2>&1; then
    git_reason="git init failed"
    rm -rf "$work"
    rm -f "$git_err_file"
    return 1
  fi
  for depth in 300 4000; do
    if ! git_authenticated -C "$work" fetch --no-tags --filter=blob:none --depth="$depth" \
      "https://github.com/${repository}.git" \
      'refs/heads/main:refs/remotes/origin/main' >/dev/null 2>"$git_err_file"; then
      fetch_err="$(one_line "$(cat "$git_err_file" 2>/dev/null || true)")"
      if [ -n "$fetch_err" ]; then
        git_reason="git fetch of main failed (${fetch_err})"
      else
        git_reason="git fetch of main failed"
      fi
      rm -rf "$work"
      rm -f "$git_err_file"
      return 1
    fi
    tip="$(git_authenticated -C "$work" rev-parse refs/remotes/origin/main 2>/dev/null || true)"
    if [ "$tip" != "$current" ]; then
      git_reason="main moved from ${current} to ${tip:-missing} while proving lineage"
      rm -rf "$work"
      rm -f "$git_err_file"
      return 1
    fi
    set +e
    git_authenticated -C "$work" merge-base --is-ancestor "$expected" "$tip" >/dev/null 2>&1
    ancestor_status=$?
    set -e
    if [ "$ancestor_status" -eq 0 ]; then
      printf 'ahead\n'
      rm -rf "$work"
      rm -f "$git_err_file"
      return 0
    fi
    shallow="$(git_authenticated -C "$work" rev-parse --is-shallow-repository 2>/dev/null || printf 'true\n')"
    if [ "$shallow" != "true" ] && [ "$ancestor_status" -eq 1 ]; then
      printf 'diverged\n'
      rm -rf "$work"
      rm -f "$git_err_file"
      return 0
    fi
    if [ "$ancestor_status" -ne 1 ] && [ "$ancestor_status" -ne 128 ]; then
      git_reason="git merge-base failed (exit ${ancestor_status})"
      rm -rf "$work"
      rm -f "$git_err_file"
      return 1
    fi
  done
  git_reason="git history is still too shallow to prove whether ${expected} is on main"
  rm -rf "$work"
  rm -f "$git_err_file"
  return 1
}

lineage=exact
lineage_source=""
compare_http=""
compare_exit=0
compare_detail=""
compare_status=""
git_reason=""
if [ "$current" != "$expected" ]; then
  lineage=unknown
  # 2026-10-23 runs 39896469044 and 39897429704: one compare failure
  # (gh exit 1, response discarded) failed the coalesce job closed and
  # skipped promotion. Retry a short transient failure. When the wait
  # cannot be honored, or the response is still unclassified, prove the
  # pair with git merge-base. Unknown after both still exits 1. A transport
  # error is never divergence and never a successful supersession (JOV-7674).
  if rest_lineage_status; then
    lineage_source=rest
  else
    # Redirect, don't capture: a command substitution would drop git_reason.
    git_status_file="$(mktemp)"
    if prove_lineage_with_git "$current" >"$git_status_file"; then
      compare_status="$(tr -d '\r\n' <"$git_status_file")"
      lineage_source=git
      echo "::warning::REST compare unavailable (exit=${compare_exit}, HTTP ${compare_http:-none}, response: ${compare_detail:-none}); proved lineage with git (${compare_status})." >&2
    fi
    rm -f "$git_status_file"
  fi
  case "${compare_status:-}" in
    ahead) lineage=ancestor ;;
    behind|diverged) lineage=diverged ;;
  esac
  if [ "$lineage" = unknown ]; then
    emit lineage unknown
    emit lineage_lookup_exit "$compare_exit"
    emit lineage_lookup_http "${compare_http:-none}"
    emit gate_decision error
    emit gate_reason lineage_lookup_unavailable
    echo "::error::Release ancestry is unknown (exit=${compare_exit}, HTTP ${compare_http:-none}); compare response: ${compare_detail:-none}; git: ${git_reason:-unproven}. Inspect GitHub compare access/response before superseding ${expected}." >&2
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
  runs_attempt=1
  runs_backoff="${LINEAGE_COMPARE_BACKOFF_SECONDS:-2}"
  [[ "$runs_backoff" =~ ^[0-9]+$ ]] || runs_backoff=2
  runs_json=""
  while [ "$runs_attempt" -le 3 ]; do
    lookup_status=0
    runs_json="$("$gh_cli" api "repos/$repository/actions/workflows/production-controller.yml/runs?branch=main&event=workflow_run&per_page=30" 2>/dev/null)" || lookup_status=$?
    if [ "$lookup_status" -eq 0 ]; then
      break
    fi
    if [ "$runs_attempt" -ge 3 ]; then
      break
    fi
    echo "::warning::Release successor lookup attempt ${runs_attempt}/3 failed (exit=${lookup_status}); retrying." >&2
    if [ "$runs_backoff" -gt 0 ]; then
      sleep "$runs_backoff"
      runs_backoff=$((runs_backoff * 2))
    fi
    runs_attempt=$((runs_attempt + 1))
  done
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
if [ -n "$lineage_source" ]; then
  emit lineage_source "$lineage_source"
fi
if [ -n "$compare_http" ]; then
  emit lineage_lookup_http "$compare_http"
fi
echo "::notice::Release lineage gate $boundary: decision=$decision lineage=$lineage source=${lineage_source:-exact} successor_pending=$successor_pending starving=$starving unshipped=$unshipped_commits age=${unshipped_age_seconds}s reason=\"$reason\"" >&2
printf 'decision=%s\n' "$decision"
