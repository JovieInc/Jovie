#!/bin/bash
# Cursor Hook: onTaskComplete
# Runs typecheck (fail-fast after task completion)
set -e

# Change to project root
cd "$(git rev-parse --show-toplevel)" || exit 1

echo "🔍 Cursor Hook: Running typecheck after task completion..."

# Run typecheck
pnpm run typecheck

echo "✅ Typecheck passed - task completed successfully"

