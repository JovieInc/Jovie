#!/bin/bash
# Cursor Hook: onTaskComplete
# Runs typecheck (fail-fast after task completion)
set -e

# Change to project root
cd "$(git rev-parse --show-toplevel)" || exit 1

echo "🔍 Cursor Hook: Running typecheck after task completion..."

# Run typecheck
pnpm run typecheck

if [ "${CURSOR_HOOK_RUN_LINT:-}" = "1" ]; then
  echo "🔍 Cursor Hook: Running lint after task completion..."
  pnpm run lint
fi

echo "✅ Typecheck passed - task completed successfully"

