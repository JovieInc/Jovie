#!/usr/bin/env bash
# Rebase train PRs (integration/* → main) and queue auto-merge when CLEAN.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Update this list when opening new integration→main train PRs.
TRAIN_PRS=(10704 10736 10737)

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
    # Graphite enqueues by label; native auto-merge retired
    gh pr edit "$num" --add-label "merge-queue" || echo "WARN: failed to enqueue #$num into Graphite merge queue" >&2
  fi
done

echo "Train drain pass complete."