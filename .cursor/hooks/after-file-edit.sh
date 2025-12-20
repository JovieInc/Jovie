#!/bin/bash
# Cursor Hook: afterFileEdit
# Runs format + lint --fix (fast, auto-correcting)
set -e

# Change to project root
cd "$(git rev-parse --show-toplevel)" || exit 1

echo "🔧 Cursor Hook: Formatting and lint-fixing files..."

# Format with biome (formats all files for consistency)
pnpm run format

# Lint with auto-fix (fixes all files)
pnpm run lint:fix

echo "✅ Format and lint-fix completed"

