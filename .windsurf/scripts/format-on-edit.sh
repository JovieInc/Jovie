#!/bin/bash
# Cascade hook: Auto-format edited files with biome
# Runs after each code edit made by Cascade

# Read JSON from stdin
input=$(cat)

# Extract file path using jq (or fallback to grep/sed if jq unavailable)
if command -v jq &> /dev/null; then
    file_path=$(echo "$input" | jq -r '.tool_info.file_path // empty')
else
    file_path=$(echo "$input" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*: *"\([^"]*\)".*/\1/')
fi

# Exit if no file path
if [ -z "$file_path" ]; then
    exit 0
fi

# Only format TypeScript/JavaScript files in apps/web
if [[ "$file_path" == *apps/web*.ts ]] || [[ "$file_path" == *apps/web*.tsx ]] || [[ "$file_path" == *apps/web*.js ]] || [[ "$file_path" == *apps/web*.jsx ]]; then
    # Run biome check with auto-fix on the specific file
    cd "$(dirname "$0")/../.." || exit 0
    pnpm biome check --write --unsafe "$file_path" 2>/dev/null || true
fi

exit 0
