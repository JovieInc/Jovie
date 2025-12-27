#!/bin/bash
# Cursor Hook: onTaskComplete
# Runs typecheck (fail-fast after task completion)
set -e

# Change to project root
cd "$(git rev-parse --show-toplevel)" || exit 1

if [ "${CURSOR_HOOK_RUN_INTEGRATION_GATE:-}" = "1" ]; then
  echo "🧱 Cursor Hook: Running integration gate (format:check, lint, typecheck, test)..."
  pnpm run format:check
  pnpm run lint
  pnpm run typecheck
  pnpm run test
else
  echo "🔍 Cursor Hook: Running typecheck after task completion..."

  # Run typecheck
  pnpm run typecheck

  if [ "${CURSOR_HOOK_RUN_LINT:-}" = "1" ]; then
    echo "🔍 Cursor Hook: Running lint after task completion..."
    pnpm run lint
  fi
fi

if [ "${CURSOR_HOOK_RUN_CODERABBIT:-}" = "1" ]; then
  echo "🐇 Cursor Hook: Running CodeRabbit review (uncommitted)..."

  has_changes="$(git status --porcelain)"
  if [ -z "$has_changes" ]; then
    echo "✅ No uncommitted changes; skipping CodeRabbit"
  else
    if command -v cr >/dev/null 2>&1; then
      if [ "${CURSOR_HOOK_CODERABBIT_STRICT:-}" = "1" ]; then
        cr review --prompt-only -t uncommitted
      else
        cr review --prompt-only -t uncommitted || true
      fi
    elif command -v coderabbit >/dev/null 2>&1; then
      if [ "${CURSOR_HOOK_CODERABBIT_STRICT:-}" = "1" ]; then
        coderabbit review --prompt-only -t uncommitted
      else
        coderabbit review --prompt-only -t uncommitted || true
      fi
    else
      echo "⚠️ CodeRabbit CLI not found (expected 'cr' or 'coderabbit'); skipping"
    fi
  fi
fi

echo "✅ Checks passed - task completed successfully"



