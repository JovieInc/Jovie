#!/usr/bin/env bash
# Post-task validation hook (Stop event)
# Runs automated checks (typecheck, lint, boundaries, tests) before allowing
# Claude to complete a task. Single pass — allows completion if all checks pass.
# No changes: allows completion immediately.

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$PROJECT_DIR"

# Read hook input from stdin
cat > /dev/null

# Check if there are any code changes to validate
CHANGED_FILES=$(git diff --name-only HEAD 2>/dev/null || true)
STAGED_FILES=$(git diff --cached --name-only 2>/dev/null || true)
ALL_CHANGED="${CHANGED_FILES}${STAGED_FILES}"

# If no code changes, allow stop
if [ -z "$ALL_CHANGED" ]; then
  echo '{"continue": true}'
  exit 0
fi

errors=()

# 1. TypeScript type check
if ! pnpm --filter @jovie/web exec tsc --noEmit >/dev/null 2>&1; then
  errors+=("TypeScript type check failed — run: pnpm --filter @jovie/web exec tsc --noEmit")
fi

# 2. Biome lint
if ! pnpm biome check apps/web --no-errors-on-unmatched >/dev/null 2>&1; then
  errors+=("Biome lint failed — run: pnpm biome check apps/web")
fi

# 3. Server/client boundary check (most common bug source)
if ! pnpm --filter @jovie/web lint:server-boundaries >/dev/null 2>&1; then
  errors+=("Server/client boundary violations found — run: pnpm --filter @jovie/web lint:server-boundaries")
fi

# 4. Run affected tests (run from apps/web since vitest is not a root script)
if ! (cd apps/web && pnpm exec vitest run --changed) >/dev/null 2>&1; then
  errors+=("Affected tests failed — run: cd apps/web && pnpm exec vitest run --changed")
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
print(json.dumps({'continue': False, 'stopReason': sys.argv[1]}))
" "$REASON"
  exit 0
fi

# All checks passed — allow completion
echo '{"continue": true}'
exit 0
