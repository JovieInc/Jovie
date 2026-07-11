#!/usr/bin/env bash
set -euo pipefail

ROOT="${WORKTREE_LIFECYCLE_ROOT:-$(git rev-parse --show-toplevel)}"
REPORT="${WORKTREE_LIFECYCLE_REPORT:-$HOME/.cache/jovie/worktree-lifecycle/latest.json}"
LOCK="${WORKTREE_LIFECYCLE_LOCK:-$HOME/.cache/jovie/worktree-lifecycle/lock}"
mkdir -p "$(dirname "$REPORT")"
if ! mkdir "$LOCK" 2>/dev/null; then
  printf '%s\n' '{"skipped":"another lifecycle run holds the lock"}'
  exit 0
fi
trap 'rmdir "$LOCK"' EXIT

exec node "$ROOT/scripts/worktree-lifecycle.mjs" reap --root "$ROOT" --apply --report "$REPORT"
