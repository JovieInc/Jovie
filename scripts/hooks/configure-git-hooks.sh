#!/usr/bin/env bash
set -euo pipefail

# Husky's generated `.husky/_` directory is intentionally untracked. A linked
# worktree therefore inherits the shared `core.hooksPath=.husky/_` config but
# has no hook wrappers, silently bypassing pre-push verification. Point Git at
# the tracked hook entrypoints instead: relative paths resolve in every
# worktree, including a fresh Codex worktree before dependencies are installed.
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"

if [[ -z "$REPO_ROOT" ]]; then
  echo "[git-hooks] not inside a Git worktree; skipping hook configuration" >&2
  exit 0
fi

if [[ ! -x "$REPO_ROOT/.husky/pre-push" ]]; then
  echo "[git-hooks] expected tracked hook missing: $REPO_ROOT/.husky/pre-push" >&2
  exit 1
fi

git -C "$REPO_ROOT" config core.hooksPath .husky
echo "[git-hooks] core.hooksPath=.husky (tracked hooks work in every worktree)"
