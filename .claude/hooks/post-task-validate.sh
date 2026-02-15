#!/usr/bin/env bash
# Post-task validation hook (Stop event)
# Runs core verification from /ship, /verify, /simplify, and /coderabbit:review
# before allowing Claude to complete a task.
#
# First stop:  Runs automated checks → if pass, blocks to request simplify + coderabbit
# Second stop: Runs automated checks → if pass, allows completion
# No changes:  Allows completion immediately

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$PROJECT_DIR"

# Read hook input from stdin
INPUT=$(cat)
STOP_HOOK_ACTIVE=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('stop_hook_active', False))" 2>/dev/null || echo "False")

# Check if there are any code changes to validate
CHANGED_FILES=$(git diff --name-only HEAD 2>/dev/null || true)
STAGED_FILES=$(git diff --cached --name-only 2>/dev/null || true)
ALL_CHANGED="${CHANGED_FILES}${STAGED_FILES}"

# If no code changes, allow stop
if [ -z "$ALL_CHANGED" ]; then
  echo '{"decision": "allow"}'
  exit 0
fi

errors=()

# 1. TypeScript type check
if ! pnpm --filter web exec tsc --noEmit >/dev/null 2>&1; then
  errors+=("TypeScript type check failed — run: pnpm --filter web exec tsc --noEmit")
fi

# 2. Biome lint
if ! pnpm biome check apps/web --no-errors-on-unmatched >/dev/null 2>&1; then
  errors+=("Biome lint failed — run: pnpm biome check apps/web")
fi

# 3. Server/client boundary check (most common bug source)
if ! pnpm --filter web lint:server-boundaries >/dev/null 2>&1; then
  errors+=("Server/client boundary violations found — run: pnpm --filter web lint:server-boundaries")
fi

# 4. Run affected tests
if ! pnpm vitest --run --changed >/dev/null 2>&1; then
  errors+=("Affected tests failed — run: pnpm vitest --run --changed")
fi

# Build the JSON response safely using python3
if [ ${#errors[@]} -gt 0 ]; then
  # Validation failed — block and report
  REASON="Post-task validation failed:\n"
  for err in "${errors[@]}"; do
    REASON+="- ${err}\n"
  done
  REASON+="\nFix these issues before completing."
  python3 -c "
import json, sys
print(json.dumps({'decision': 'block', 'reason': sys.argv[1]}))
" "$REASON"
  exit 0
fi

# Validation passed
if [ "$STOP_HOOK_ACTIVE" = "False" ]; then
  # First stop — request simplify + coderabbit before allowing completion
  python3 -c "
import json
print(json.dumps({
    'decision': 'block',
    'reason': 'All automated checks passed (typecheck, lint, boundaries, tests). Before completing, please also:\n1. Run /simplify on your changes to clean up recently modified code\n2. Run /coderabbit:review to catch issues static analysis misses\n3. Fix any findings from above, then complete.'
}))
"
  exit 0
fi

# Second stop (stop_hook_active=True) — validation passed, allow completion
echo '{"decision": "allow"}'
exit 0
