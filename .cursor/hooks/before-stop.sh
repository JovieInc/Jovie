#!/bin/bash
# Cursor Hook: beforeStop
# Runs typecheck (fail-fast before stopping)
set -e

# Change to project root
cd "$(git rev-parse --show-toplevel)" || exit 1

echo "🔍 Cursor Hook: Running typecheck before stop..."

# Run typecheck
pnpm run typecheck

echo "✅ Typecheck passed"

