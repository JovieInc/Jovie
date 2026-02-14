#!/bin/bash
# Warn on TypeScript anti-patterns

# Parse from TOOL_INPUT (supports jq and fallback)
if command -v jq &> /dev/null; then
  file_path=$(echo "$TOOL_INPUT" | jq -r '.file_path // empty' 2>/dev/null)
  content=$(echo "$TOOL_INPUT" | jq -r '.content // .new_string // empty' 2>/dev/null)
else
  file_path=$(echo "$TOOL_INPUT" | grep -oP '"file_path"\s*:\s*"\K[^"]+' 2>/dev/null || true)
  content=$(echo "$TOOL_INPUT" | grep -oP '"(content|new_string)"\s*:\s*"\K[^"]+' 2>/dev/null || true)
fi

if [ -z "$file_path" ] || [ -z "$content" ]; then
  exit 0
fi

# Only check TypeScript files
if [[ ! "$file_path" =~ \.(ts|tsx)$ ]]; then
  exit 0
fi

# Skip test files (aligned with Biome overrides)
if [[ "$file_path" =~ \.(test|spec)\.(ts|tsx)$ ]] || \
   [[ "$file_path" =~ /tests/ ]] || \
   [[ "$file_path" =~ \.storybook/ ]]; then
  exit 0
fi

warnings=0

# Check for @ts-ignore (should use @ts-expect-error with comment)
if echo "$content" | grep -q '@ts-ignore'; then
  echo "WARNING: @ts-ignore found - use @ts-expect-error with explanation instead"
  echo "  Track in docs/TECH_DEBT_TRACKER.md if unavoidable"
  warnings=1
fi

# Check for explicit any (error level per user preference)
if echo "$content" | grep -qE ': any[^a-zA-Z]|<any>|as any'; then
  echo "BLOCKED: Explicit 'any' type not allowed in production code"
  echo "File: $file_path"
  echo ""
  echo "Use proper typing or 'unknown' instead:"
  echo "  - Define interface/type for the data"
  echo "  - Use 'unknown' with type guards"
  echo "  - Use generic constraints"
  exit 1
fi

exit $warnings
