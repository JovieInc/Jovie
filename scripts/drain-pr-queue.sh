#!/usr/bin/env bash
# Graphite-native PR queue drain.
# Classifies every open PR and ENROLLS the clean ones into the Graphite merge
# queue by applying the `merge-queue` label. It also removes that label from
# PRs that cannot currently merge so they stop occupying queue slots.
# Autonomous shipping (2026-06-22): MQ pauses on taste/hold only — not auth/migration.
#
# It deliberately does NOT:
#   - run `gh pr merge` (branch protection lets only the Graphite app push to
#     main; Graphite rebase-merges enrolled PRs server-side)
#   - retarget to integration/loop-* (agents ship straight to main now)
#   - close PRs (surfaced for a human instead — see the SURFACE bucket)
#
# Buckets that need code work (CONFLICT / BLOCKED) are printed for the
# /drain command to fan out per-PR worktree agents (cheap model for mechanical
# rebases, capable model for semantic conflicts).
#
# Env:
#   DRY_RUN=1   classify and print only; apply no labels
set -euo pipefail

# shellcheck source=./scripts/lib/gh-retry.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/gh-retry.sh"

REPO="${REPO:-JovieInc/Jovie}"
DRY_RUN="${DRY_RUN:-0}"
# Branches that are agent-owned (safe to rebase/force-push in a fix agent).
AGENT_RE='^(tim/|codex/|agent/|claude/|linear/|feat/|dependabot/)'

label() {  # label <num> <label>
  [[ "$DRY_RUN" == "1" ]] && { echo "    [dry-run] would +$2 on #$1"; return 0; }
  gh_retry pr edit "$1" -R "$REPO" --add-label "$2" >/dev/null 2>&1 \
    && echo "    +$2 on #$1" || echo "    !! failed to add $2 on #$1"
}

unlabel() {  # unlabel <num> <label>
  [[ "$DRY_RUN" == "1" ]] && { echo "    [dry-run] would -$2 on #$1"; return 0; }
  gh_retry pr edit "$1" -R "$REPO" --remove-label "$2" >/dev/null 2>&1 \
    && echo "    -$2 on #$1" || echo "    !! failed to remove $2 on #$1"
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
        ((.bucket // "") | test("fail|pending|cancel"; "i"))
        or ((.state // "") | test("FAIL|ERROR|CANCEL|TIMED_OUT|ACTION_REQUIRED|PENDING|QUEUED|IN_PROGRESS|WAITING"; "i"))
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
      # `gh pr checks` exits 8 when checks are pending, even with valid JSON.
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

ENRICHED="[]"
while IFS= read -r pr; do
  n="$(jq -r '.n' <<<"$pr")"
  fail="[]"
  if jq -e '
    (.draft | not)
    and (.m == "MERGEABLE")
    and ((.head | startswith("gtmq_")) | not)
    and (([.L[]] | any(. == "needs-human-taste" or . == "needs-human" or . == "hold" or . == "gated" or . == "fast")) | not)
  ' <<<"$pr" >/dev/null; then
    fail="$(check_failures_for_pr "$n")"
  fi
  ENRICHED="$(jq -c --argjson pr "$pr" --argjson fail "$fail" '. + [$pr + {fail: $fail}]' <<<"$ENRICHED")"
done < <(jq -c '.[]' <<<"$SNAP")
SNAP="$ENRICHED"

# --- SUMMARY: make queue shape obvious in scheduled logs ---
echo "=== QUEUE SUMMARY ==="
echo "$SNAP" | jq -r '
  def labels: (.L // []);
  def queued: labels | index("merge-queue");
  def hard_gated: labels | any(. == "needs-human-taste" or . == "needs-human" or . == "hold" or . == "gated");
  [
    "  CLEAN: " + ([.[] | select(queued and (.ms // "") == "CLEAN")] | length | tostring),
    "  UNSTABLE: " + ([.[] | select(queued and (.ms // "") == "UNSTABLE")] | length | tostring),
    "  BLOCKED: " + ([.[] | select(queued and (.ms // "") == "BLOCKED")] | length | tostring),
    "  DIRTY: " + ([.[] | select(queued and (.ms // "") == "DIRTY")] | length | tostring),
    "  hard-gated: " + ([.[] | select(hard_gated)] | length | tostring),
    "  gtmq: " + ([.[] | select((.head // "") | startswith("gtmq_"))] | length | tostring)
  ] | .[]'

# --- DEQUEUE: hard-gated PRs must not occupy Graphite queue slots ---
echo "=== DEQUEUE (hard gates → -merge-queue) ==="
echo "$SNAP" | jq -c '.[]
  | select([.L[]] | index("merge-queue"))
  | select((.head|startswith("gtmq_"))|not)
  | select([.L[]] | any(. == "needs-human-taste" or . == "needs-human" or . == "hold" or . == "gated"))' \
| while read -r pr; do
    n=$(jq -r '.n' <<<"$pr"); t=$(jq -r '.t' <<<"$pr")
    echo "  #$n  $t"
    unlabel "$n" merge-queue
  done

# --- DEQUEUE: conflicted, red, unknown, or explicitly queued-for-fix PRs ---
echo "=== DEQUEUE (non-clean → -merge-queue) ==="
echo "$SNAP" | jq -c '.[]
  | select([.L[]] | index("merge-queue"))
  | select((.head|startswith("gtmq_"))|not)
  | select(([.L[]] | any(.=="needs-human-taste" or .=="needs-human" or .=="hold" or .=="gated")) | not)
  | select(
      ([.L[]] | any(.=="needs-conflict-resolution"))
      or ((.ms // "CLEAN") != "CLEAN")
      or (.m != "MERGEABLE")
      or (.fail|length>0)
    )' \
| while read -r pr; do
    n=$(jq -r '.n' <<<"$pr"); t=$(jq -r '.t' <<<"$pr")
    reason=$(jq -r '
      [
        (if ([.L[]] | any(.=="needs-conflict-resolution")) then "needs-conflict-resolution" else empty end),
        (if (.ms // "CLEAN") != "CLEAN" then "mergeStateStatus=" + (.ms // "UNKNOWN") else empty end),
        (if .m != "MERGEABLE" then "mergeable=" + (.m // "UNKNOWN") else empty end),
        (if (.fail|length)>0 then "checks=" + (.fail|join(",")) else empty end)
      ] | join("; ")
    ' <<<"$pr")
    echo "  #$n  $t  ✗ $reason"
    unlabel "$n" merge-queue
  done

# --- ENROLL: non-draft, mergeable, green, not opted-out, not already queued ---
echo "=== ENROLL (clean → +merge-queue) ==="
echo "$SNAP" | jq -c '.[]
  | select(.draft|not)
  | select(.m=="MERGEABLE")
  | select((.ms // "CLEAN")=="CLEAN")
  | select(.fail|length==0)
  | select((.head|startswith("gtmq_"))|not)
  | select([.L[]] | any(.=="needs-human-taste" or .=="needs-human" or .=="hold" or .=="gated" or .=="needs-conflict-resolution" or .=="merge-queue" or .=="fast") | not)' \
| while read -r pr; do
    n=$(jq -r '.n' <<<"$pr"); t=$(jq -r '.t' <<<"$pr")
    echo "  #$n  $t"
    label "$n" merge-queue
  done

# --- CONFLICT: needs rebase (agent branches only) → label + hand to fix agent ---
echo "=== CONFLICT (needs rebase → fix agent) ==="
echo "$SNAP" | jq -r --arg re "$AGENT_RE" '.[]
  | select(.m=="CONFLICTING")
  | select((.head|startswith("gtmq_"))|not)
  | select(.head|test($re))
  | select([.L[]] | any(.=="needs-human-taste" or .=="needs-human" or .=="hold" or .=="gated") | not)
  | "  #\(.n)  \(.t)  [\(.head)]"'
echo "$SNAP" | jq -r --arg re "$AGENT_RE" '.[]
  | select(.m=="CONFLICTING")
  | select((.head|startswith("gtmq_"))|not)
  | select(.head|test($re))
  | select([.L[]] | any(.=="needs-human-taste" or .=="needs-human" or .=="hold" or .=="gated") | not) | .n' \
| while read -r n; do [[ -n "$n" ]] && label "$n" needs-conflict-resolution; done

# --- BLOCKED: mergeable but red checks → hand to fix agent ---
echo "=== BLOCKED (red checks → fix agent) ==="
echo "$SNAP" | jq -r '.[]
  | select(.draft|not) | select(.m=="MERGEABLE") | select(.fail|length>0)
  | select([.L[]] | any(.=="needs-human-taste" or .=="needs-human" or .=="hold" or .=="gated") | not)
  | "  #\(.n)  \(.t)  ✗ \(.fail|join(", "))"'

# --- SURFACE: human-gated / superseded → report only, never auto-close ---
echo "=== SURFACE (human decision; not touched) ==="
echo "$SNAP" | jq -r '.[]
  | select([.L[]] | any(.=="needs-human-taste" or .=="needs-human" or .=="hold" or .=="gated"))
  | "  #\(.n)  \(.t)  {\(.L|join(","))}"'

# --- Graphite MQ working drafts (the queue itself; leave alone) ---
echo "=== GRAPHITE MQ in-flight (leave) ==="
echo "$SNAP" | jq -r '.[] | select(.head|startswith("gtmq_")) | "  #\(.n)  \(.t)"'

echo "=== done (DRY_RUN=$DRY_RUN) ==="
