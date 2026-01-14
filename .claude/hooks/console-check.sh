#!/bin/bash
# Block console.* statements in production code (use Sentry per agents.md Section 15)

file_path=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
content=$(jq -r '.tool_input.content // .tool_input.new_string // empty' 2>/dev/null)

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
