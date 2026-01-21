#!/bin/bash
# Block console.* statements in production code (use Sentry per agents.md Section 15)

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

# Allow console in tests, scripts, dev-only files
if [[ "$file_path" =~ \.(test|spec)\.(ts|tsx)$ ]] || \
   [[ "$file_path" =~ /tests/ ]] || \
   [[ "$file_path" =~ /scripts/ ]] || \
   [[ "$file_path" =~ \.config\. ]]; then
  exit 0
fi

# Block console.log, console.error, console.warn in production code
if echo "$content" | grep -qE 'console\.(log|error|warn|info|debug)\('; then
  echo "BLOCKED: console.* statements not allowed in production code"
  echo "File: $file_path"
  echo ""
  echo "Use Sentry logging instead (per agents.md Section 15):"
  echo "  import * as Sentry from '@sentry/nextjs';"
  echo "  Sentry.captureException(error);"
  echo "  // or for logs:"
  echo "  const { logger } = Sentry;"
  echo "  logger.error('message', { context });"
  exit 1
fi

exit 0
