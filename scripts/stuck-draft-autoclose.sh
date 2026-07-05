#!/usr/bin/env bash
# Stuck Draft Auto-Close
#
# Closes agent-owned draft PRs that have been idle (>48h since last update)
# with failing checks. This prevents stale drafts from accumulating and
# confusing the merge-queue prioritization.
#
# Opt out per-PR with any of: needs-human, hold, gated.
# Human-owned branches are never touched.
#
# Env:
#   DRY_RUN=1       classify and print only; close nothing
#   STUCK_IDLE_HOURS=48  hours of idle before considering stuck
set -euo pipefail

# shellcheck source=./scripts/lib/gh-retry.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/gh-retry.sh"

REPO="${REPO:-JovieInc/Jovie}"
DRY_RUN="${DRY_RUN:-0}"
STUCK_IDLE_HOURS="${STUCK_IDLE_HOURS:-48}"
AGENT_RE='^(tim/|codex/|agent/|claude/|linear/|dependabot/)'

close_pr() {  # close_pr <num> <comment>
  local n="$1" body="$2"
  [[ "$DRY_RUN" == "1" ]] && { echo "    [dry-run] would close #$n"; return 0; }
  gh_retry pr comment "$n" -R "$REPO" --body "$body" >/dev/null 2>&1 \
    && echo "    ✓ commented on #$n" || true
  gh_retry pr close "$n" -R "$REPO" >/dev/null 2>&1 \
    && echo "    ✓ closed #$n" || echo "    !! failed to close #$n"
}

check_failures_for_pr() {  # check_failures_for_pr <num>
  local n="$1"
  local attempts="${GH_RETRY_ATTEMPTS:-5}"
  local base_delay="${GH_RETRY_BASE_DELAY:-2}"
  local max_delay="${GH_RETRY_MAX_DELAY:-30}"
  local attempt=1
  local out_file err_file err delay
  out_file="$(mktemp)"
  err_file="$(mktemp)"

  local jq_filter='[
    .[]
    | select(
        ((.bucket // "") | test("^fail$"; "i"))
        or ((.state // "") | test("^(FAILURE|ERROR|TIMED_OUT|ACTION_REQUIRED|STARTUP_FAILURE)$"; "i"))
      )
    | select(((.name // "") | test("advisory|Preview Deploy|Slop Gate"; "i")) | not)
    | (.name // .workflow // .description // "unnamed check")
  ]'

  while [[ "$attempt" -le "$attempts" ]]; do
    : >"$out_file"
    : >"$err_file"
    if gh pr checks "$n" -R "$REPO" --required --json name,bucket,state,workflow,description --jq "$jq_filter" >"$out_file" 2>"$err_file"; then
      if jq -e 'type == "array"' "$out_file" >/dev/null 2>&1; then
        cat "$out_file"
        rm -f "$out_file" "$err_file"
        return 0
      fi
    elif jq -e 'type == "array"' "$out_file" >/dev/null 2>&1; then
      cat "$out_file"
      rm -f "$out_file" "$err_file"
      return 0
    fi

    err="$(<"$err_file")"
    if [[ "$attempt" -eq "$attempts" ]] || ! gh_retry_is_transient_error "$err"; then
      [[ -n "$err" ]] && echo "  !! could not read required checks for #$n: $err" >&2
      jq -cn --arg reason "required check status unavailable" '[$reason]'
      rm -f "$out_file" "$err_file"
      return 0
    fi

    delay=$((base_delay * (2 ** (attempt - 1))))
    [[ "$delay" -gt "$max_delay" ]] && delay="$max_delay"
    echo "  [gh-retry] pr checks #$n attempt $attempt/$attempts failed (transient); retrying in ${delay}s…" >&2
    sleep "$delay"
    attempt=$((attempt + 1))
  done

  rm -f "$out_file" "$err_file"
  jq -cn --arg reason "required check status unavailable" '[$reason]'
}

# Compute the cutoff timestamp (ISO) for idle detection
now_ms="$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')"
cutoff_ms=$((now_ms - STUCK_IDLE_HOURS * 3600 * 1000))
cutoff_iso="$(date -u -d @$((cutoff_ms / 1000)) +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || python3 -c "import datetime; print(datetime.datetime.utcfromtimestamp($cutoff_ms/1000).strftime('%Y-%m-%dT%H:%M:%SZ'))")"

echo "=== STUCK DRAFT AUTO-CLOSE: idle >${STUCK_IDLE_HOURS}h with failing checks ==="
echo "  Cutoff: $cutoff_iso"

SNAP="$(gh_retry pr list -R "$REPO" --state open --limit 200 \
  --json number,title,isDraft,mergeable,mergeStateStatus,labels,headRefName,updatedAt --jq '
  [ .[] | {
    n: .number,
    t: (.title[0:48]),
    draft: .isDraft,
    m: .mergeable,
    ms: (.mergeStateStatus // "UNKNOWN"),
    head: .headRefName,
    updated: .updatedAt,
    L: [.labels[].name],
    fail: []
  } ]')"

# Enrich with check failures for agent-owned drafts
ENRICHED="[]"
while IFS= read -r pr; do
  n="$(jq -r '.n' <<<"$pr")"
  fail="[]"
  if jq -e '
    .draft
    and ((.head | test("^(tim/|codex/|agent/|claude/|linear/|dependabot/)")))
    and (([.L[]] | any(. == "needs-human" or . == "hold" or . == "gated")) | not)
  ' <<<"$pr" >/dev/null; then
    fail="$(check_failures_for_pr "$n")"
  fi
  ENRICHED="$(jq -c --argjson pr "$pr" --argjson fail "$fail" '. + [$pr + {fail: $fail}]' <<<"$ENRICHED")"
done < <(jq -c '.[]' <<<"$SNAP")
SNAP="$ENRICHED"

# Filter: draft + agent + idle > cutoff + failing checks + not opted out
STUCK="$(echo "$SNAP" | jq -c --arg cutoff "$cutoff_iso" '[.[] |
  select(.draft)
  and ((.head | test("^(tim/|codex/|agent/|claude/|linear/|dependabot/)")))
  and ((.updated // "9999-01-01") < $cutoff)
  and (.fail | length > 0)
  and ([.L[]] | any(. == "needs-human" or . == "hold" or . == "gated") | not)
]')"

count="$(jq length <<<"$STUCK")"
echo "  Found $count stuck draft(s)"

if [[ "$count" -eq 0 ]]; then
  echo "=== done (nothing to close) ==="
  exit 0
fi

echo "=== CLOSE: idle agent drafts with failing checks ==="
echo "$STUCK" | jq -c '.[]' | while read -r pr; do
  n=$(jq -r '.n' <<<"$pr"); t=$(jq -r '.t' <<<"$pr")
  updated=$(jq -r '.updated' <<<"$pr")
  fails=$(jq -r '.fail | join(", ")' <<<"$pr")
  echo "  #$n  $t  (updated: $updated, failing: $fails)"
  close_pr "$n" "🤖 Auto-closed: draft idle >${STUCK_IDLE_HOURS}h with failing checks. Reopen if still needed."
done

echo "=== done (DRY_RUN=$DRY_RUN) ==="
