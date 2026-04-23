#!/usr/bin/env bash
#
# Codex worktree setup for Jovie.
#
# Keep this as a thin wrapper. The canonical bootstrap lives in scripts/setup.sh
# so Codex, Conductor, Claude, and humans all exercise the same setup path.
set -euo pipefail

CODEX_HOOK=0
if [[ "${1:-}" == "--codex-hook" ]]; then
  CODEX_HOOK=1
  shift
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "$REPO_ROOT"

if [[ ! -f "$REPO_ROOT/scripts/setup.sh" ]]; then
  echo "Missing scripts/setup.sh in $REPO_ROOT" >&2
  exit 1
fi

if [[ "$CODEX_HOOK" == "1" ]]; then
  bash "$REPO_ROOT/scripts/setup.sh" "$@" >&2
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Jovie setup completed successfully."}}'
else
  exec bash "$REPO_ROOT/scripts/setup.sh" "$@"
fi
