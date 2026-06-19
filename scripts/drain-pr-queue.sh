#!/usr/bin/env bash
# Drain the main-target PR backlog per btw Phase 0 + ci-branching policy.
# Closes conflicted agent PRs, retargets remainder to integration/loop-*,
# refreshes dependabot, and queues safe auto-merges.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

RETARGET_COMMENT='Main-target queue drain (btw Phase 0). Reopened against the recommended integration branch — full CI runs on the domain train PR only. Policy: `.claude/rules/ci-branching.md`, state: `.context/loop-state.json`.'

close_pr() {
  local num="$1"
  local reason="${2:-queue drain}"
  echo "Closing #$num ($reason)"
  gh pr close "$num" --comment "$CLOSE_COMMENT ($reason)" 2>/dev/null || true
}

close_pr_silent() {
  local num="$1"
  gh pr close "$num" 2>/dev/null || true
}

remove_testing_label() {
  local num="$1"
  echo "Removing testing label from #$num"
  gh pr edit "$num" --remove-label testing 2>/dev/null || true
}

enable_automerge() {
  local num="$1"
  echo "Adding #$num to Graphite merge queue"
  # Graphite enqueues by label; native auto-merge retired
  if ! gh pr edit "$num" --add-label "merge-queue"; then
    echo "WARN: failed to enqueue #$num into Graphite merge queue" >&2
    return 1
  fi
}

update_branch() {
  local num="$1"
  echo "Updating branch for #$num"
  gh api -X PUT "repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/pulls/${num}/update-branch" 2>/dev/null || true
}

suggest_integration() {
  local head="$1"
  local title="${2:-}"
  local combined="${head} ${title}"
  node --input-type=module -e "
    import { suggestIntegrationBranch } from './scripts/lib/ci-branching-guard.mjs';
    console.log(suggestIntegrationBranch('${combined//\'/\\\'}'));
  " 2>/dev/null || echo "integration/loop-ui"
}

retarget_to_integration() {
  local num="$1"
  local head="$2"
  local title="$3"
  local integration
  integration="$(suggest_integration "$head" "$title")"

  echo "Retargeting #$num ($head) -> $integration"
  close_pr_silent "$num"
  if gh pr list --head "$head" --state open --json number --jq '.[0].number' 2>/dev/null | grep -q .; then
    echo "  Skip: open PR already exists for $head"
    return 0
  fi
  gh pr create \
    --base "$integration" \
    --head "$head" \
    --title "$title" \
    --body "${RETARGET_COMMENT}

Integration fast lane only. Merge via \`scripts/loop-integration-ship.sh ${integration} ${head}\` after local verify.

<!-- linear-issue-id:$(echo "$head" | sed -n 's/.*[Jj][Oo][Vv]-\?\([0-9]*\).*/JOV-\1/p' | tr '[:lower:]' '[:upper:]') -->" \
    2>/dev/null && echo "  Created integration PR for $head" || echo "  Failed to create integration PR for $head"
}

CLOSE_COMMENT='Closed to reduce main CI/merge-queue saturation. Reopen targeting `integration/loop-{domain}` for agent batch work, or rebase onto `main` and open a fresh PR. See `scripts/drain-pr-queue.sh` and `.context/loop-state.json`.'

echo "=== Strip testing label from non-risk PRs ==="
gh pr list --base main --state open --limit 100 --json number,headRefName,labels,title \
  --jq '.[] | select([.labels[].name] | index("testing")) | select(.title | test("\\(auth\\)|\\(billing\\)|\\(migration\\)|clerk|proxy"; "i") | not) | "\(.number)|\(.headRefName)"' \
  | while IFS='|' read -r num _; do
    [[ -n "$num" ]] && remove_testing_label "$num"
  done

echo "=== Close DIRTY agent/codex PRs (merge conflicts) ==="
gh pr list --base main --state open --limit 100 --json number,headRefName,mergeStateStatus,title \
  --jq '.[] | select(.mergeStateStatus=="DIRTY") | select(.headRefName | test("^(tim/|codex/|agent/|claude/|linear/|feat/)")) | "\(.number)|\(.headRefName)|\(.title)"' \
  | while IFS='|' read -r num head title; do
    [[ -n "$num" ]] && close_pr "$num" "DIRTY — merge conflicts"
    [[ -n "$head" ]] && retarget_to_integration "$num" "$head" "$title"
  done

echo "=== Retarget remaining agent PRs off main (max 5 per integration branch) ==="
COUNT_FILE="$(mktemp)"
trap 'rm -f "$COUNT_FILE"' EXIT
: >"$COUNT_FILE"

integration_count() {
  local branch="$1"
  local count
  count="$(grep -c "^${branch}$" "$COUNT_FILE" 2>/dev/null || true)"
  count="${count:-0}"
  echo "$count"
}

record_integration() {
  echo "$1" >>"$COUNT_FILE"
}

while IFS='|' read -r num head title; do
  [[ -z "$num" ]] && continue
  integration="$(suggest_integration "$head" "$title")"
  count="$(integration_count "$integration")"
  if [[ "$count" -ge 5 ]]; then
    echo "Skipping #$num — $integration already has 5 queued"
    close_pr "$num" "integration batch full for $integration"
    continue
  fi
  retarget_to_integration "$num" "$head" "$title"
  record_integration "$integration"
done < <(
  gh pr list --base main --state open --limit 100 --json number,headRefName,title,labels \
    --jq '.[] | select(.headRefName | test("^(tim/|codex/|agent/|claude/|linear/|feat/)")) | select([.labels[].name] | index("needs-human") | not) | "\(.number)|\(.headRefName)|\(.title)"'
)

echo "=== Refresh BEHIND dependabot branches ==="
gh pr list --base main --state open --author "app/dependabot" --json number,mergeStateStatus \
  --jq '.[] | select(.mergeStateStatus=="BEHIND" or .mergeStateStatus=="UNKNOWN") | .number' \
  | while read -r num; do
    [[ -n "$num" ]] && update_branch "$num"
  done

echo "=== Enable auto-merge on CLEAN dependabot patch/minor ==="
gh pr list --base main --state open --author "app/dependabot" --json number,mergeStateStatus \
  --jq '.[] | select(.mergeStateStatus=="CLEAN") | .number' \
  | while read -r num; do
    [[ -n "$num" ]] && enable_automerge "$num"
  done

echo "=== Summary ==="
echo "Open PRs targeting main:"
gh pr list --base main --state open --limit 100 | wc -l | xargs echo "  count:"
echo "Open PRs targeting integration:"
gh pr list --state open --limit 100 --json baseRefName --jq '[.[] | select(.baseRefName | startswith("integration/"))] | length' 2>/dev/null || echo "  (query failed)"
echo "Done."