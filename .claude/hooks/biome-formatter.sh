#!/bin/bash
# Auto-format files with biome after edits

file_path=$(jq -r '.tool_input.file_path' 2>/dev/null)

if [ -z "$file_path" ]; then
  exit 0
fi

# Only run biome on supported file types
if [[ "$file_path" =~ \.(ts|tsx|js|jsx|json|mjs|cjs)$ ]]; then
  cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
  pnpm biome check --write "$file_path" 2>/dev/null
fi

exit 0
