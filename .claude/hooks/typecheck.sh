#!/bin/bash
# TypeScript type check hook - runs after code changes to catch type errors
# Reports errors to Claude so they can be fixed immediately

set -e

file_path=$(echo "$TOOL_INPUT" | jq -r '.file_path // empty' 2>/dev/null)

if [ -z "$file_path" ]; then
  exit 0
fi

# Only run on TypeScript files
if [[ ! "$file_path" =~ \.(ts|tsx)$ ]]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

# Run typecheck and capture output
# Using turbo for caching - subsequent runs will be fast if no changes
typecheck_output=$(pnpm typecheck 2>&1) || typecheck_exit=$?

if [ "${typecheck_exit:-0}" -ne 0 ]; then
  echo "⚠️ TypeScript errors detected:"
  echo "$typecheck_output" | head -50  # Limit output to avoid overwhelming

  # Count total errors
  error_count=$(echo "$typecheck_output" | grep -c "error TS" || true)
  if [ "$error_count" -gt 50 ]; then
    echo ""
    echo "... and $((error_count - 50)) more errors. Run 'pnpm typecheck' for full output."
  fi
  exit 1
fi

exit 0
