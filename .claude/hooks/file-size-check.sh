#!/bin/bash
# Warn if file exceeds 500 lines

# Parse from TOOL_INPUT (supports jq and fallback)
if command -v jq &> /dev/null; then
  file_path=$(echo "$TOOL_INPUT" | jq -r '.file_path // empty' 2>/dev/null)
else
  file_path=$(echo "$TOOL_INPUT" | grep -oP '"file_path"\s*:\s*"\K[^"]+' 2>/dev/null || true)
fi

if [ -z "$file_path" ]; then
  exit 0
fi

# Skip test files, migrations, generated files
if [[ "$file_path" =~ \.(test|spec)\.(ts|tsx)$ ]] || \
   [[ "$file_path" =~ /migrations/ ]] || \
   [[ "$file_path" =~ \.generated\. ]]; then
  exit 0
fi

# Determine project directory with fallback
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

# Check file exists and count lines
if [ -f "$PROJECT_DIR/$file_path" ]; then
  lines=$(wc -l < "$PROJECT_DIR/$file_path")
  if [ "$lines" -gt 500 ]; then
    echo "WARNING: File exceeds 500 lines ($lines lines)"
    echo "File: $file_path"
    echo ""
    echo "Consider splitting into smaller modules:"
    echo "  - Extract utility functions"
    echo "  - Split by feature/concern"
    echo "  - Create sub-components"
  fi
fi

exit 0
