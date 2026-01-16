#!/bin/bash
# Protect critical files based on agents.md HARD GUARDRAILS
# Adapted for Windsurf - exit 2 to block
# - Prevent modification of Drizzle migrations (append-only, line 51)
# - Prevent creation of middleware.ts (use proxy.ts instead, line 11)
# - Check for biome-ignore suppressions (never allowed, line 52)

# Get file path and content from stdin (Windsurf passes JSON via stdin)
input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_info.file_path // .file_path // empty' 2>/dev/null)
jq_exit_path=$?
content=$(echo "$input" | jq -r '.tool_info.content // .content // empty' 2>/dev/null)
jq_exit_content=$?

# Fail closed: block if jq fails or if input is non-empty but file_path is empty
if [ "$jq_exit_path" -ne 0 ] || [ "$jq_exit_content" -ne 0 ]; then
  echo "BLOCKED: Unable to parse JSON input for file protection checks" >&2
  exit 2
fi

if [ -n "$input" ] && [ -z "$file_path" ]; then
  echo "BLOCKED: Missing file_path in JSON input" >&2
  exit 2
fi

if [ -z "$file_path" ]; then
  exit 0
fi

# HARD GUARDRAIL: Drizzle migrations are immutable (agents.md line 51)
if [[ "$file_path" =~ drizzle/migrations/.*\.sql$ ]] || [[ "$file_path" =~ drizzle/migrations/meta/_journal\.json$ ]]; then
  echo "BLOCKED: Drizzle migration files are IMMUTABLE (agents.md line 51)"
  echo "File: $file_path"
  echo ""
  echo "Drizzle migrations are append-only once merged to main."
  echo "You cannot edit, delete, reorder, squash, or regenerate existing migrations."
  echo ""
  echo "If a past migration is incorrect, escalate to a human instead of attempting an automated fix."
  echo ""
  echo "To add a new migration:"
  echo "  pnpm --filter=@jovie/web run drizzle:generate"
  exit 2  # Exit 2 blocks in Windsurf
fi

# HARD GUARDRAIL: No middleware.ts allowed (agents.md line 11)
# Match both root-level and nested middleware.ts (but exclude .next/)
if [[ "$file_path" =~ (^|/)middleware\.ts$ ]] && [[ ! "$file_path" =~ \.next/ ]]; then
  echo "BLOCKED: Do not create middleware.ts (agents.md line 11)"
  echo "File: $file_path"
  echo ""
  echo "This repo uses apps/web/proxy.ts as the middleware entrypoint."
  echo "The proxy.ts file is enforced via 'pnpm next:proxy-guard'."
  echo ""
  echo "Add your middleware logic to:"
  echo "  apps/web/proxy.ts"
  exit 2  # Exit 2 blocks in Windsurf
fi

# HARD GUARDRAIL: Never suppress Biome errors (agents.md line 52)
if [ -n "$content" ]; then
  if echo "$content" | grep -q "biome-ignore"; then
    echo "BLOCKED: biome-ignore comments are not allowed (agents.md line 52)"
    echo "File: $file_path"
    echo ""
    echo "Do NOT use biome-ignore to suppress lint or format errors."
    echo "Always address the root cause by fixing the code to comply with Biome rules."
    echo ""
    echo "Proper fixes include:"
    echo "  - Using semantic HTML elements"
    echo "  - Adding proper ARIA roles"
    echo "  - Refactoring for accessibility"
    echo "  - Restructuring code to follow best practices"
    echo ""
    echo "If a rule seems incorrect, discuss with the team before suppressing."
    exit 2  # Exit 2 blocks in Windsurf
  fi
fi

# SUCCESS: File operation is allowed
exit 0
