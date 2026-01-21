#!/bin/bash
# Combined post-write checks for Windsurf
# Includes: lint, typecheck, console check, ts-strict check, file-size check
# Note: Post-hooks in Windsurf cannot block - they run after the action completes
# These are warnings only

# Get file path from tool input (synced with Claude hooks)
file_path=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)

# If parsing fails or no file_path, exit silently (post-hooks can't block anyway)
if [ -z "$file_path" ]; then
  exit 0
fi

# Navigate to project root (script is in .windsurf/scripts/)
cd "$(dirname "$0")/../.." || exit 0

warnings=0

# Determine if this is a test file (skip some checks for tests)
is_test=false
if [[ "$file_path" =~ \.(test|spec)\.(ts|tsx)$ ]] || \
   [[ "$file_path" =~ /tests/ ]] || \
   [[ "$file_path" =~ \.storybook/ ]]; then
  is_test=true
fi

# =============================================================================
# LINT CHECK (Biome)
# =============================================================================
if [[ "$file_path" =~ \.(ts|tsx|js|jsx|json|mjs|cjs)$ ]]; then
  # First, auto-fix what we can
  pnpm biome check --write "$file_path" 2>/dev/null || true

  # Then check for remaining errors
  lint_output=$(pnpm biome check --reporter=github "$file_path" 2>&1) || lint_exit=$?

  if [ "${lint_exit:-0}" -ne 0 ]; then
    echo "WARNING: Biome lint errors in $file_path:"
    echo "$lint_output"
    echo ""
    warnings=1
  fi
fi

# =============================================================================
# TYPECHECK (TypeScript)
# =============================================================================
if [[ "$file_path" =~ \.(ts|tsx)$ ]]; then
  typecheck_output=$(pnpm typecheck 2>&1) || typecheck_exit=$?

  if [ "${typecheck_exit:-0}" -ne 0 ]; then
    echo "WARNING: TypeScript errors detected:"
    echo "$typecheck_output" | head -30

    # Count total errors
    error_count=$(echo "$typecheck_output" | grep -c "error TS" || true)
    if [ "$error_count" -gt 30 ]; then
      echo ""
      echo "... and $((error_count - 30)) more errors. Run 'pnpm typecheck' for full output."
    fi
    echo ""
    warnings=1
  fi
fi

# =============================================================================
# CONSOLE CHECK (skip tests)
# =============================================================================
if [ "$is_test" = false ] && [[ "$file_path" =~ \.(ts|tsx|js|jsx)$ ]]; then
  # Skip config files
  if [[ ! "$file_path" =~ \.config\. ]] && [[ ! "$file_path" =~ /scripts/ ]]; then
    if [ -f "$file_path" ]; then
      if grep -qE 'console\.(log|error|warn|info|debug)\(' "$file_path" 2>/dev/null; then
        echo "WARNING: console.* statements found in $file_path"
        echo "Use Sentry logging instead (per agents.md Section 15):"
        echo "  import * as Sentry from '@sentry/nextjs';"
        echo "  Sentry.captureException(error);"
        echo ""
        warnings=1
      fi
    fi
  fi
fi

# =============================================================================
# TS-STRICT CHECK (skip tests)
# =============================================================================
if [ "$is_test" = false ] && [[ "$file_path" =~ \.(ts|tsx)$ ]]; then
  if [ -f "$file_path" ]; then
    # Check for @ts-ignore (should use @ts-expect-error)
    if grep -q '@ts-ignore' "$file_path" 2>/dev/null; then
      echo "WARNING: @ts-ignore found in $file_path"
      echo "Use @ts-expect-error with explanation instead"
      echo "Track in TECH_DEBT_TRACKER.md if unavoidable"
      echo ""
      warnings=1
    fi

    # Check for explicit any
    if grep -qE ': any[^a-zA-Z]|<any>|as any' "$file_path" 2>/dev/null; then
      echo "WARNING: Explicit 'any' type found in $file_path"
      echo "Use proper typing or 'unknown' instead:"
      echo "  - Define interface/type for the data"
      echo "  - Use 'unknown' with type guards"
      echo "  - Use generic constraints"
      echo ""
      warnings=1
    fi
  fi
fi

# =============================================================================
# FILE SIZE CHECK
# =============================================================================
# Skip test files, migrations, generated files
if [[ ! "$file_path" =~ \.(test|spec)\.(ts|tsx)$ ]] && \
   [[ ! "$file_path" =~ /migrations/ ]] && \
   [[ ! "$file_path" =~ \.generated\. ]]; then
  if [ -f "$file_path" ]; then
    lines=$(wc -l < "$file_path")
    if [ "$lines" -gt 500 ]; then
      echo "WARNING: File exceeds 500 lines ($lines lines)"
      echo "File: $file_path"
      echo ""
      echo "Consider splitting into smaller modules:"
      echo "  - Extract utility functions"
      echo "  - Split by feature/concern"
      echo "  - Create sub-components"
      echo ""
      warnings=1
    fi
  fi
fi

# Always exit 0 - post hooks cannot block
if [ "$warnings" -ne 0 ]; then
  echo "=================================================="
  echo "Post-write checks completed with warnings."
  echo "Please review the issues above before committing."
  echo "=================================================="
  echo ""
fi
exit 0
