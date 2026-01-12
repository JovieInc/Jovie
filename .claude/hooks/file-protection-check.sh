#!/bin/bash
# Protect critical files based on agents.md HARD GUARDRAILS
# - Prevent modification of Drizzle migrations (append-only, line 51)
# - Prevent creation of middleware.ts (use proxy.ts instead, line 11)
# - Check for biome-ignore suppressions (never allowed, line 52)

# Get file path and operation from tool input
file_path=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
content=$(jq -r '.tool_input.content // .tool_input.new_string // empty' 2>/dev/null)

if [ -z "$file_path" ]; then
  exit 0
fi

# HARD GUARDRAIL: Drizzle migrations are immutable (agents.md line 51)
if [[ "$file_path" =~ drizzle/migrations/.*\.sql$ ]] || [[ "$file_path" =~ drizzle/migrations/meta/_journal\.json$ ]]; then
  echo "🚨 BLOCKED: Drizzle migration files are IMMUTABLE (agents.md line 51)"
  echo "File: $file_path"
  echo ""
  echo "Drizzle migrations are append-only once merged to main."
  echo "You cannot edit, delete, reorder, squash, or regenerate existing migrations."
  echo ""
  echo "If a past migration is incorrect, escalate to a human instead of attempting an automated fix."
  echo ""
  echo "To add a new migration:"
  echo "  pnpm --filter=@jovie/web run drizzle:generate"
  exit 1
fi

# HARD GUARDRAIL: No middleware.ts allowed (agents.md line 11)
if [[ "$file_path" =~ /middleware\.ts$ ]] && [[ ! "$file_path" =~ \.next/ ]]; then
  echo "🚨 BLOCKED: Do not create middleware.ts (agents.md line 11)"
  echo "File: $file_path"
  echo ""
  echo "This repo uses apps/web/proxy.ts as the middleware entrypoint."
  echo "The proxy.ts file is enforced via 'pnpm next:proxy-guard'."
  echo ""
  echo "Add your middleware logic to:"
  echo "  apps/web/proxy.ts"
  exit 1
fi

# HARD GUARDRAIL: Never suppress Biome errors (agents.md line 52)
if [ -n "$content" ]; then
  if echo "$content" | grep -q "biome-ignore"; then
    echo "🚨 BLOCKED: biome-ignore comments are not allowed (agents.md line 52)"
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
    exit 1
  fi
fi

# SUCCESS: File operation is allowed
exit 0