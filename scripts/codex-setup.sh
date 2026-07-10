#!/usr/bin/env bash
#
# Codex worktree setup for Jovie.
#
# Keep this as a thin wrapper. The canonical bootstrap lives in scripts/setup.sh
# so Codex, Conductor, Claude, and humans all exercise the same setup path.
# Codex hook mode must be resilient: setup failures don't block agent sessions.
set -uo pipefail

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

emit_session_start_json() {
  local context="$1"
  HOOK_CONTEXT="$context" node <<'NODE'
const context = process.env.HOOK_CONTEXT || "Jovie setup completed successfully.";
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: context,
  },
}) + "\n");
NODE
}

if [[ "$CODEX_HOOK" == "1" ]]; then
  bash "$REPO_ROOT/scripts/setup.sh" "$@" >&2 || true
  GBRAIN_CONTEXT=""
  if [[ -f "$REPO_ROOT/scripts/codex-gbrain-sync.sh" ]]; then
    GBRAIN_CONTEXT="$(bash "$REPO_ROOT/scripts/codex-gbrain-sync.sh" session-start 2>&1 || true)"
    if [[ -n "$GBRAIN_CONTEXT" ]]; then
      printf '%s\n' "$GBRAIN_CONTEXT" >&2
    fi
  fi

  HOOK_CONTEXT="Jovie setup completed successfully."
  if [[ -n "$GBRAIN_CONTEXT" ]]; then
    HOOK_CONTEXT="${HOOK_CONTEXT}"$'\n'"${GBRAIN_CONTEXT}"
  fi
  emit_session_start_json "$HOOK_CONTEXT"
else
  bash "$REPO_ROOT/scripts/setup.sh" "$@"
  if [[ -f "$REPO_ROOT/scripts/codex-gbrain-sync.sh" ]]; then
    bash "$REPO_ROOT/scripts/codex-gbrain-sync.sh" session-start || true
  fi
fi
