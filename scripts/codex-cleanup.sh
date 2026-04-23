#!/usr/bin/env bash
#
# Codex lifecycle cleanup for Jovie.
#
# This script is safe to run at the end of every Codex task. It does lightweight
# local cleanup by default and delegates heavier cleanup only when explicitly
# requested through environment flags.
set -euo pipefail

CODEX_HOOK=0
if [[ "${1:-}" == "--codex-hook" ]]; then
  CODEX_HOOK=1
  shift
  exec 3>&1
  exec 1>&2
fi

if [[ ! -t 0 ]]; then
  cat >/dev/null || true
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "$REPO_ROOT"

echo "Running Codex cleanup..."

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git worktree prune --expire now >/dev/null 2>&1 || true
  echo "  Pruned stale git worktree metadata"
fi

NEXT_CACHE="$REPO_ROOT/apps/web/.next/cache"
if [[ -d "$NEXT_CACHE" ]]; then
  rm -rf "$NEXT_CACHE/pack" "$NEXT_CACHE/turbopack"
  echo "  Cleared stale Turbopack cache"
fi

if [[ "${CODEX_CLEANUP_E2E_USERS:-0}" == "1" ]]; then
  if command -v doppler >/dev/null 2>&1; then
    doppler run --project jovie-web --config dev -- \
      pnpm tsx apps/web/scripts/cleanup-e2e-users.ts --force || {
        echo "  E2E user cleanup failed; continuing Codex cleanup" >&2
      }
  else
    echo "  Doppler CLI not available; skipped E2E user cleanup" >&2
  fi
else
  echo "  Skipped E2E user cleanup (set CODEX_CLEANUP_E2E_USERS=1 to enable)"
fi

if [[ "${CODEX_ARCHIVE_ON_STOP:-0}" == "1" ]]; then
  bash "$REPO_ROOT/scripts/archive.sh"
else
  echo "  Skipped archive cleanup (set CODEX_ARCHIVE_ON_STOP=1 to enable)"
fi

echo "Codex cleanup complete."

if [[ "$CODEX_HOOK" == "1" ]]; then
  printf '%s\n' '{"continue":true}' >&3
  exec 3>&-
fi
