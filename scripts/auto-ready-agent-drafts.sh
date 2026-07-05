#!/usr/bin/env bash
# Auto-Ready Agent Drafts
#
# Finds agent-owned draft PRs that are MERGEABLE with zero failing terminal
# checks and flips them to "ready for review". The merge-queue autoenroll
# workflow then picks them up.
#
# Opt out per-PR with any of: needs-human, hold, gated, fast.
#
# Env:
#   DRY_RUN=1   classify and print only; flip no PRs
set -euo pipefail

# shellcheck source=./scripts/lib/gh-retry.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/gh-retry.sh"

REPO="${REPO:-JovieInc/Jovie}"
DRY_RUN="${DRY_RUN:-0}"
AGENT_RE='^(tim/|codex/|agent/|claude/|linear/|dependabot/)'

mark_ready() {  # mark_ready <num>
  [[ "$DRY_RUN" == "1" ]] && { echo "    [dry-run] would mark #$1 ready"; return 0; }
  gh_retry pr ready "$1" -R "$REPO" >/dev/null 2>&1 \
    && echo "    ✓ marked #$1 ready" || echo "    !! failed to mark #$1 ready"
}

comment() {  # comment <num> <body>
  [[ "$DRY_RUN" == "1" ]] && { echo "    [dry-run] would comment on #$1"; return 0; }
  gh_retry pr comment "$1" -R "$REPO" --body "$2" >/dev/null 2>&1 \
    && echo "    ✓ commented on #$1" || echo "    !! failed to comment on #$1"
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

  # TERMINAL failures only. Same filter as drain-pr-queue.sh.
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

echo "=== AUTO-READY: scanning for green agent drafts ==="

SNAP="$(gh_retry pr list -R "$REPO" --state open --limit 200 \
  --json number,title,isDraft,mergeable,mergeStateStatus,labels,headRefName --jq '
  [ .[] | {
    n: .number,
    t: (.title[0:48]),
    draft: .isDraft,
    m: .mergeable,
    ms: (.mergeStateStatus // "UNKNOWN"),
    head: .headRefName,
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
    and (.m == "MERGEABLE")
    and ((.head | test("^(tim/|codex/|agent/|claude/|linear/|dependabot/)")))
    and (([.L[]] | any(. == "needs-human" or . == "hold" or . == "gated" or . == "fast")) | not)
  ' <<<"$pr" >/dev/null; then
    fail="$(check_failures_for_pr "$n")"
  fi
  ENRICHED="$(jq -c --argjson pr "$pr" --argjson fail "$fail" '. + [$pr + {fail: $fail}]' <<<"$ENRICHED")"
done < <(jq -c '.[]' <<<"$SNAP")
SNAP="$ENRICHED"

# Flip green agent drafts to ready
echo "=== FLIP: draft + agent + mergeable + 0 failing checks → ready ==="
echo "$SNAP" | jq -c '.[]
  | select(.draft)
  | select(.m == "MERGEABLE")
  | select((.head | test("^(tim/|codex/|agent/|claude/|linear/|dependabot/)")))
  | select(.fail | length == 0)
  | select([.L[]] | any(. == "needs-human" or . == "hold" or . == "gated" or . == "fast") | not)' \
  | while read -r pr; do
    n=$(jq -r '.n' <<<"$pr"); t=$(jq -r '.t' <<<"$pr")
    echo "  #$n  $t"
    mark_ready "$n"
    comment "$n" "🤖 Auto-ready: all required checks passing. Enrolling in merge queue."
  done

echo "=== done (DRY_RUN=$DRY_RUN) ==="
