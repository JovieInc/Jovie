#!/bin/bash
# Lint check hook - runs after edits to catch lint errors
# This hook auto-fixes what it can, then reports remaining errors to Claude

set -e

# Parse file path from TOOL_INPUT (supports jq and fallback)
if command -v jq &> /dev/null; then
  file_path=$(echo "$TOOL_INPUT" | jq -r '.file_path // empty' 2>/dev/null)
else
  file_path=$(echo "$TOOL_INPUT" | grep -oP '"file_path"\s*:\s*"\K[^"]+' 2>/dev/null || true)
fi

if [ -z "$file_path" ]; then
  exit 0
fi

# Only run on supported file types
if [[ ! "$file_path" =~ \.(ts|tsx|js|jsx|json|mjs|cjs)$ ]]; then
  exit 0
fi

# Determine project directory with fallback
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0

# Skip if dependencies aren't installed (will be installed by session-start hook)
if [ ! -d "node_modules" ]; then
  echo "Skipping lint check: node_modules not installed yet"
  exit 0
fi

# First, auto-fix what we can
pnpm biome check --write "$file_path" 2>/dev/null || true

# Then check for remaining errors and report them
# Use --reporter=github for cleaner output
lint_output=$(pnpm biome check --reporter=github "$file_path" 2>&1) || lint_exit=$?

if [ "${lint_exit:-0}" -ne 0 ]; then
  echo "Biome lint errors in $file_path:"
  echo "$lint_output"
  exit 1
fi

exit 0
