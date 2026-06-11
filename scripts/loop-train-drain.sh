#!/usr/bin/env bash
# Rebase train PRs (integration/* → main) and queue auto-merge when CLEAN.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Update this list when opening new integration→main train PRs.
TRAIN_PRS=(10702 10703 10704)

for num in "${TRAIN_PRS[@]}"; do
  state="$(gh pr view "$num" --json mergeStateStatus -q .mergeStateStatus 2>/dev/null || echo MISSING)"
  echo "Train PR #$num: $state"
  if [[ "$state" == "MISSING" ]]; then
    continue
  fi
  if [[ "$state" == "BLOCKED" || "$state" == "BEHIND" || "$state" == "UNKNOWN" ]]; then
    gh api -X PUT "repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/pulls/${num}/update-branch" 2>/dev/null || \
      echo "  (update-branch skipped — may be in merge queue)"
  fi
  if [[ "$state" == "CLEAN" ]]; then
    gh pr merge "$num" --auto --squash 2>/dev/null || true
  fi
done

echo "Train drain pass complete."