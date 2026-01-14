#!/bin/bash
# Warn if file exceeds 500 lines

file_path=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)

if [ -z "$file_path" ]; then
  exit 0
fi

# Skip test files, migrations, generated files
if [[ "$file_path" =~ \.(test|spec)\.(ts|tsx)$ ]] || \
   [[ "$file_path" =~ /migrations/ ]] || \
   [[ "$file_path" =~ \.generated\. ]]; then
  exit 0
fi

# Check file exists and count lines
if [ -f "$CLAUDE_PROJECT_DIR/$file_path" ]; then
  lines=$(wc -l < "$CLAUDE_PROJECT_DIR/$file_path")
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
