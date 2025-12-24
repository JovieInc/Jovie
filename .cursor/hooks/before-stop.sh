#!/bin/bash
# Cursor Hook: beforeStop
# Runs typecheck (fail-fast before stopping)
set -e

# Change to project root
cd "$(git rev-parse --show-toplevel)" || exit 1

echo "🔍 Cursor Hook: Running typecheck before stop..."

# Run typecheck
pnpm run typecheck

if [ "${CURSOR_HOOK_RUN_LINT:-}" = "1" ]; then
  echo "🔍 Cursor Hook: Running lint before stop..."
  pnpm run lint
fi

echo "✅ Typecheck passed"

