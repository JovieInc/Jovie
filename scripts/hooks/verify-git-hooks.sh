#!/usr/bin/env bash
# Cheap, fail-closed check that this worktree will run the tracked git hooks.
# Agent bootstraps call this after the installer so a missing hook cannot be silent.
set -euo pipefail

EXPECTED_HOOKS_PATH=".husky"

root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$root" ]]; then
  echo "[git-hooks] verify failed: not inside a Git worktree" >&2
  exit 1
fi

current="$(git -C "$root" config --get core.hooksPath || true)"
if [[ "$current" != "$EXPECTED_HOOKS_PATH" ]]; then
  echo "[git-hooks] verify failed: core.hooksPath is '${current:-unset}', expected ${EXPECTED_HOOKS_PATH}." >&2
  echo "[git-hooks] Run: bash scripts/hooks/configure-git-hooks.sh" >&2
  exit 1
fi

fail=0
for name in pre-commit pre-push; do
  hook="$root/$EXPECTED_HOOKS_PATH/$name"
  if [[ ! -e "$hook" ]]; then
    echo "[git-hooks] verify failed: $hook is missing" >&2
    fail=1
    continue
  fi
  if [[ ! -x "$hook" ]]; then
    echo "[git-hooks] verify failed: $hook is not executable" >&2
    fail=1
  fi
done
if [[ "$fail" -ne 0 ]]; then
  echo "[git-hooks] Run: bash scripts/hooks/configure-git-hooks.sh" >&2
  exit 1
fi

echo "[git-hooks] ok: core.hooksPath=${EXPECTED_HOOKS_PATH} and pre-commit + pre-push are executable" >&2
