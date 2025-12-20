#!/bin/bash
# Cursor Hook: onError
# Dumps actionable output back into the agent context
# Note: We don't use set -e here because we want to collect all diagnostics even if some commands fail

# Change to project root
cd "$(git rev-parse --show-toplevel)" || exit 1

echo "❌ Cursor Hook: Error detected - collecting diagnostic information..."

# Run typecheck to get type errors
echo ""
echo "=== TypeScript Errors ==="
pnpm run typecheck 2>&1 || true

# Run lint to get linting errors
echo ""
echo "=== Linting Errors ==="
pnpm run lint 2>&1 || true

# Check git status
echo ""
echo "=== Git Status ==="
git status --short || true

echo ""
echo "💡 Review the errors above and fix them before continuing"

