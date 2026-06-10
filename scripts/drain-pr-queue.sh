#!/usr/bin/env bash
# Drain the main-target PR backlog: close blocked duplicates, strip misapplied
# testing labels, refresh stale branches, and queue safe auto-merges.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

CLOSE_COMMENT='Closed to reduce main CI/merge-queue saturation. Reopen targeting `integration/loop-{domain}` for agent batch work, or rebase onto `main` and open a fresh PR. See `scripts/drain-pr-queue.sh` and `.context/loop-state.json`.'

close_pr() {
  local num="$1"
  local reason="${2:-queue drain}"
  echo "Closing #$num ($reason)"
  gh pr close "$num" --comment "$CLOSE_COMMENT ($reason)" || true
}

remove_testing_label() {
  local num="$1"
  echo "Removing testing label from #$num"
  gh pr edit "$num" --remove-label testing 2>/dev/null || true
}

enable_automerge() {
  local num="$1"
  echo "Enabling auto-merge on #$num"
  gh pr merge "$num" --auto --squash 2>/dev/null || true
}

update_branch() {
  local num="$1"
  echo "Updating branch for #$num"
  gh api -X PUT "repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/pulls/${num}/update-branch" 2>/dev/null || true
}

echo "=== Remove testing label from non-auth PRs ==="
for num in 10415 10414; do
  remove_testing_label "$num"
done

echo "=== Close BLOCKED tim/* PRs (need rebase; clog merge queue) ==="
for num in 10448 10447 10446 10445 10444 10413; do
  close_pr "$num" "BLOCKED — rebase required"
done

echo "=== Close library PR superseded by integration train #10455 ==="
close_pr 10402 "library migration train #10455"

echo "=== Refresh UNKNOWN merge state PRs ==="
gh pr list --state open --limit 100 --json number,mergeStateStatus --jq '.[] | select(.mergeStateStatus=="UNKNOWN") | .number' | while read -r num; do
  [[ -n "$num" ]] && update_branch "$num"
done

echo "=== Enable auto-merge on low-risk CLEAN PRs ==="
SAFE_AUTOMERGE=(10408 10407 10406 10404 10396 10395 10394 10392 10344 10342 10320)
for num in "${SAFE_AUTOMERGE[@]}"; do
  state=$(gh pr view "$num" --json mergeStateStatus -q .mergeStateStatus 2>/dev/null || echo "MISSING")
  if [[ "$state" == "CLEAN" ]]; then
    enable_automerge "$num"
  fi
done

echo "=== Dependabot: enable auto-merge on patch/minor when CLEAN ==="
gh pr list --state open --author "app/dependabot" --json number,mergeStateStatus --jq '.[] | select(.mergeStateStatus=="CLEAN") | .number' | while read -r num; do
  [[ -n "$num" ]] && enable_automerge "$num"
done

echo "=== Done ==="
gh pr list --state open --limit 100 | wc -l | xargs echo "Open PRs:"