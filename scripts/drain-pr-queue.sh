#!/usr/bin/env bash
# Graphite-native PR queue drain.
# Classifies every open PR and ENROLLS the clean ones into the Graphite merge
# queue by applying the `merge-queue` label. That label is the only mutation.
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

# shellcheck source=lib/gh-retry.sh
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

# statusCheckRollup on 50+ open PRs in one GraphQL call reliably 504s; fetch
# metadata in bulk, then rollup per mergeable non-draft PR only.
failed_checks_for_pr() {  # failed_checks_for_pr <num> → JSON array of check names
  gh_retry pr view "$1" -R "$REPO" --json statusCheckRollup --jq '
    [ .statusCheckRollup[]?
      | select((.conclusion//"")|test("FAILURE|TIMED_OUT|CANCELLED|ACTION_REQUIRED"))
      | (.name // .context)
      | select((. | test("advisory|Preview Deploy|Slop Gate"; "i")) | not) ]' \
    2>/dev/null || echo '[]'
}

build_pr_snapshot() {
  local meta pr n fail_json entry snap='[]'
  meta="$(gh_retry pr list -R "$REPO" --state open --limit 100 \
    --json number,title,isDraft,mergeable,labels,headRefName,author)"
  while IFS= read -r pr; do
    n="$(jq -r '.number' <<<"$pr")"
    fail_json='[]'
    if [[ "$(jq -r '.isDraft' <<<"$pr")" == "false" && "$(jq -r '.mergeable' <<<"$pr")" == "MERGEABLE" ]]; then
      fail_json="$(failed_checks_for_pr "$n")"
    fi
    entry="$(jq -n --argjson pr "$pr" --argjson fail "$fail_json" '{
      n: $pr.number,
      t: ($pr.title[0:48]),
      draft: $pr.isDraft,
      m: $pr.mergeable,
      head: $pr.headRefName,
      L: [$pr.labels[].name],
      fail: $fail
    }')"
    snap="$(jq --argjson e "$entry" '. + [$e]' <<<"$snap")"
  done < <(jq -c '.[]' <<<"$meta")
  echo "$snap"
}

SNAP="$(build_pr_snapshot)"

# --- ENROLL: non-draft, mergeable, green, not opted-out, not already queued ---
echo "=== ENROLL (clean → +merge-queue) ==="
echo "$SNAP" | jq -c '.[]
  | select(.draft|not)
  | select(.m=="MERGEABLE")
  | select(.fail|length==0)
  | select((.head|startswith("gtmq_"))|not)
  | select([.L[]] | any(.=="needs-human" or .=="hold" or .=="gated" or .=="merge-queue" or .=="fast") | not)' \
| while read -r pr; do
    n=$(jq -r '.n' <<<"$pr"); t=$(jq -r '.t' <<<"$pr")
    echo "  #$n  $t"
    label "$n" merge-queue
  done

# --- CONFLICT: needs rebase (agent branches only) → label + hand to fix agent ---
echo "=== CONFLICT (needs rebase → fix agent) ==="
echo "$SNAP" | jq -r --arg re "$AGENT_RE" '.[]
  | select(.m=="CONFLICTING")
  | select(.head|test($re))
  | select([.L[]]|index("needs-human")|not)
  | "  #\(.n)  \(.t)  [\(.head)]"'
echo "$SNAP" | jq -r --arg re "$AGENT_RE" '.[]
  | select(.m=="CONFLICTING") | select(.head|test($re))
  | select([.L[]]|index("needs-human")|not) | .n' \
| while read -r n; do [[ -n "$n" ]] && label "$n" needs-conflict-resolution; done

# --- BLOCKED: mergeable but red checks → hand to fix agent ---
echo "=== BLOCKED (red checks → fix agent) ==="
echo "$SNAP" | jq -r '.[]
  | select(.draft|not) | select(.m=="MERGEABLE") | select(.fail|length>0)
  | select([.L[]]|index("needs-human")|not)
  | "  #\(.n)  \(.t)  ✗ \(.fail|join(", "))"'

# --- SURFACE: human-gated / superseded → report only, never auto-close ---
echo "=== SURFACE (human decision; not touched) ==="
echo "$SNAP" | jq -r '.[]
  | select([.L[]]|index("needs-human"))
  | "  #\(.n)  \(.t)  {\(.L|join(","))}"'

# --- Graphite MQ working drafts (the queue itself; leave alone) ---
echo "=== GRAPHITE MQ in-flight (leave) ==="
echo "$SNAP" | jq -r '.[] | select(.head|startswith("gtmq_")) | "  #\(.n)  \(.t)"'

echo "=== done (DRY_RUN=$DRY_RUN) ==="
