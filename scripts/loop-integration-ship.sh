#!/usr/bin/env bash
# Fast ship to an integration branch (skips main CI / merge queue).
# Usage: ./scripts/loop-integration-ship.sh <integration-branch> <feature-branch> [pr-title]
set -euo pipefail

INTEGRATION_BRANCH="${1:?integration branch required (e.g. integration/loop-ui)}"
FEATURE_BRANCH="${2:?feature branch required (e.g. tim/jov-2945)}"
PR_TITLE="${3:-$(git log -1 --pretty=%s)}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if [[ "$(git branch --show-current)" != "$FEATURE_BRANCH" ]]; then
  echo "Checkout $FEATURE_BRANCH first" >&2
  exit 1
fi

echo "==> Local verify (integration fast path)"
pnpm --filter @jovie/web run typecheck -- --pretty false
pnpm biome check --write "$(git diff --name-only "origin/${INTEGRATION_BRANCH}"...HEAD | grep -E '\.(ts|tsx|js|mjs)$' || true)" 2>/dev/null || pnpm biome check apps/web

echo "==> Push $FEATURE_BRANCH"
git push -u origin "$FEATURE_BRANCH"

EXISTING_PR="$(gh pr list --head "$FEATURE_BRANCH" --base "$INTEGRATION_BRANCH" --json number --jq '.[0].number // empty')"
if [[ -n "$EXISTING_PR" ]]; then
  PR_NUM="$EXISTING_PR"
  echo "==> Update existing PR #$PR_NUM"
  gh pr edit "$PR_NUM" --title "$PR_TITLE"
else
  PR_NUM="$(gh pr create \
    --base "$INTEGRATION_BRANCH" \
    --head "$FEATURE_BRANCH" \
    --title "$PR_TITLE" \
    --body "Integration train PR — local verify only. Full CI runs on integration→main train.

<!-- linear-issue-identifier:$(echo "$FEATURE_BRANCH" | sed -n 's/.*jov-\([0-9]*\).*/JOV-\1/p' | tr '[:lower:]' '[:upper:]') -->
")"
  echo "==> Created PR #$PR_NUM"
fi

echo "==> Merge into $INTEGRATION_BRANCH (no main CI wait)"
gh pr merge "$PR_NUM" --squash --delete-branch

echo "==> Refresh integration branch locally"
git fetch origin "$INTEGRATION_BRANCH"
echo "Done: $FEATURE_BRANCH -> $INTEGRATION_BRANCH (PR #$PR_NUM)"