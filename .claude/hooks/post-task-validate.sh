#!/usr/bin/env bash
# Post-task validation hook (Stop event)
# Checks only what the session changed, in the session's own checkout, before
# allowing Claude to stop. Full-suite and affected-test runs belong to CI.
# No changes: allows completion immediately.

set -uo pipefail

INPUT=$(cat)

# Validate the checkout the session is working in (a worktree session's cwd),
# not the launch directory in CLAUDE_PROJECT_DIR.
CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
cd "${CWD:-${CLAUDE_PROJECT_DIR:-.}}" 2>/dev/null || exit 0
cd "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || exit 0

# A second Stop after a block means Claude already saw the report; let it stop.
if [ "$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)" = "true" ]; then
  exit 0
fi

[ -d node_modules ] || exit 0

# Changed = modified/staged/untracked, excluding deletions.
CHANGED=$( { git diff --name-only --diff-filter=d HEAD; git ls-files --others --exclude-standard; } 2>/dev/null | sort -u)
[ -z "$CHANGED" ] && exit 0

LINTABLE=$(printf '%s\n' "$CHANGED" | grep -E '\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|css)$' || true)
WEB_TS=$(printf '%s\n' "$CHANGED" | grep -E '^apps/web/.*\.(ts|tsx)$' || true)
WEB_TESTS=$(printf '%s\n' "$WEB_TS" | grep -E '\.test\.(ts|tsx)$' | sed 's|^apps/web/||' || true)

errors=()

# 1. Biome on changed files only (pre-existing drift elsewhere is not this session's).
if [ -n "$LINTABLE" ]; then
  # shellcheck disable=SC2086
  if ! pnpm biome check --no-errors-on-unmatched --files-ignore-unknown=true $LINTABLE >/dev/null 2>&1; then
    errors+=("Biome lint failed — run: pnpm biome check --write <changed files>")
  fi
fi

if [ -n "$WEB_TS" ]; then
  # 2. TypeScript (incremental, single-flight)
  if ! pnpm --filter @jovie/web run typecheck -- --pretty false >/dev/null 2>&1; then
    errors+=("TypeScript type check failed — run: pnpm --filter @jovie/web run typecheck -- --pretty false")
  fi

  # 3. Server/client boundary check (most common bug source)
  if ! pnpm --filter @jovie/web lint:server-boundaries >/dev/null 2>&1; then
    errors+=("Server/client boundary violations found — run: pnpm --filter @jovie/web lint:server-boundaries")
  fi

  # 4. Changed test files only. ponytail: `vitest --changed` walks the import
  # graph and ran >10min after editing a shared module; CI runs affected tests.
  if [ -n "$WEB_TESTS" ]; then
    # shellcheck disable=SC2086
    if ! (cd apps/web && pnpm exec vitest run $WEB_TESTS) >/dev/null 2>&1; then
      errors+=("Changed tests failed — run: cd apps/web && pnpm exec vitest run $(echo $WEB_TESTS)")
    fi
  fi
fi

[ ${#errors[@]} -eq 0 ] && exit 0

REASON="Post-task validation failed:"$'\n'
for err in "${errors[@]}"; do
  REASON+="- ${err}"$'\n'
done
REASON+=$'\n'"Fix these issues before completing."
jq -n --arg r "$REASON" '{decision: "block", reason: $r}'
exit 0
