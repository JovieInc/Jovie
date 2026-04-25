#!/bin/bash
# Protect critical files based on AGENTS.md HARD GUARDRAILS
# - Prevent edits to existing Drizzle migration history while allowing new generated artifacts
# - Prevent creation of middleware.ts (use proxy.ts instead, line 11)
# - Check for biome-ignore suppressions (never allowed, line 52)
# - Prevent hardcoded legacy dashboard route literals in app/components
# - Prevent dynamic marketing page revalidation patterns
# - Prevent nested layouts from rendering global singleton UI

# Get file path and content from tool input (TOOL_INPUT is a JSON string)
# Support both jq and fallback for environments without jq
if command -v jq &> /dev/null; then
  file_path=$(echo "$TOOL_INPUT" | jq -r '.file_path // empty' 2>/dev/null)
  content=$(echo "$TOOL_INPUT" | jq -r '.content // .new_string // empty' 2>/dev/null)
else
  # Fallback: basic grep extraction (less reliable but works without jq)
  file_path=$(echo "$TOOL_INPUT" | grep -oP '"file_path"\s*:\s*"\K[^"]+' 2>/dev/null || true)
  content=$(echo "$TOOL_INPUT" | grep -oP '"(content|new_string)"\s*:\s*"\K[^"]+' 2>/dev/null || true)
fi

if [ -z "$file_path" ]; then
  exit 0
fi

# HARD GUARDRAIL: Existing Drizzle migration history is immutable.
# Allow generated append-only artifacts for a new migration:
# - new drizzle/migrations/*.sql
# - new drizzle/migrations/meta/*_snapshot.json
# - append/update drizzle/migrations/meta/_journal.json
if [[ "$file_path" =~ (^|/)drizzle/migrations/.*\.sql$ ]] || [[ "$file_path" =~ (^|/)drizzle/migrations/meta/.*_snapshot\.json$ ]]; then
  if git cat-file -e "HEAD:$file_path" 2>/dev/null; then
    echo "🚨 BLOCKED: Existing Drizzle migration history is immutable"
    echo "File: $file_path"
    echo ""
    echo "Do not edit migration SQL or snapshot files that already exist on the base branch."
    echo "Create a new migration instead, and let Drizzle append the matching journal entry."
    echo ""
    echo "To add a new migration:"
    echo "  pnpm --filter=@jovie/web run drizzle:generate"
    exit 1
  fi
fi

# HARD GUARDRAIL: No middleware.ts allowed (AGENTS.md line 11)
if [[ "$file_path" =~ /middleware\.ts$ ]] && [[ ! "$file_path" =~ \.next/ ]]; then
  echo "🚨 BLOCKED: Do not create middleware.ts (AGENTS.md line 11)"
  echo "File: $file_path"
  echo ""
  echo "This repo uses apps/web/proxy.ts as the middleware entrypoint."
  echo "The proxy.ts file is enforced via 'pnpm next:proxy-guard'."
  echo ""
  echo "Add your middleware logic to:"
  echo "  apps/web/proxy.ts"
  exit 1
fi

# HARD GUARDRAIL: Never suppress Biome errors (AGENTS.md line 52)
if [ -n "$content" ]; then
  if echo "$content" | grep -q "biome-ignore"; then
    echo "🚨 BLOCKED: biome-ignore comments are not allowed (AGENTS.md line 52)"
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

# HARD GUARDRAIL: Route literals must use constants in app/components code
if [[ "$file_path" =~ ^apps/web/(app|components)/.*\.(ts|tsx)$ ]] \
  && [[ ! "$file_path" =~ \.(test|spec|stories)\.(ts|tsx)$ ]]; then
  if echo "$content" | grep -qE "['\"]/app/dashboard/(analytics|audience|earnings|profile|releases|links|chat)['\"]"; then
    echo "🚨 BLOCKED: Hardcoded legacy dashboard route literal detected"
    echo "File: $file_path"
    echo ""
    echo "Import the route from apps/web/constants/routes.ts instead of embedding /app/dashboard/* strings."
    exit 1
  fi
fi

# HARD GUARDRAIL: Main chat route must remain orchestration-only
if [[ "$file_path" == "apps/web/app/api/chat/route.ts" ]] && [ -n "$content" ]; then
  if echo "$content" | grep -qE "function create[A-Z].*Tool\s*\(" || \
     echo "$content" | grep -qE "tool\s*\(\s*\{[[:space:][:print:]]*execute\s*:"; then
    echo "🚨 BLOCKED: apps/web/app/api/chat/route.ts must not define inline chat tools"
    echo "File: $file_path"
    echo ""
    echo "Keep the chat route orchestration-only. Move tool implementations into:"
    echo "  apps/web/lib/chat/tools/"
    echo ""
    echo "The main chat route may compose imported tool builders, but it may not"
    echo "define create*Tool functions or inline tool({ execute }) blocks."
    exit 1
  fi
fi

# HARD GUARDRAIL: Marketing pages must remain fully static
if [[ "$file_path" =~ ^apps/web/app/\(marketing\)/.*\.(ts|tsx)$ ]]; then
  if echo "$content" | grep -qE "export const revalidate\s*=" \
    && ! echo "$content" | grep -qE "export const revalidate\s*=\s*false\b"; then
    echo "🚨 BLOCKED: Marketing pages must use export const revalidate = false"
    echo "File: $file_path"
    exit 1
  fi

  if echo "$content" | grep -qE "headers\(|cookies\(|cache:\s*['\"]no-store['\"]"; then
    echo "🚨 BLOCKED: Marketing pages must not depend on request-time data or no-store fetches"
    echo "File: $file_path"
    exit 1
  fi
fi

# HARD GUARDRAIL: Global singleton UI must not mount from nested layouts
if [[ "$file_path" =~ ^apps/web/app/.+/layout\.tsx$ ]] && [[ "$file_path" != "apps/web/app/layout.tsx" ]]; then
  if echo "$content" | grep -qE "CookieBannerSection|ToastProvider|ClerkAnalytics|<Analytics|ModalProvider"; then
    echo "🚨 BLOCKED: Global UI singletons must render only from apps/web/app/layout.tsx"
    echo "File: $file_path"
    exit 1
  fi
fi

# SUCCESS: File operation is allowed
exit 0
