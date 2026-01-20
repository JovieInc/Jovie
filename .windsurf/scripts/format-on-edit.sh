#!/bin/bash
# Cascade hook: Auto-format edited files with biome
# Runs after each code edit made by Cascade

# Extract file path from tool input (synced with Claude hooks)
file_path=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)

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
