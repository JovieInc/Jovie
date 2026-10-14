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

# Desktop hook shells do not necessarily load the interactive nvm integration.
# Select an already-installed pinned runtime; never install one in a hook.
NODE_PIN="$(tr -d '[:space:]' < "$REPO_ROOT/.nvmrc")"
NVM_NODE_BIN="${NVM_DIR:-$HOME/.nvm}/versions/node/v${NODE_PIN}/bin"
if [[ -x "$NVM_NODE_BIN/node" ]]; then
  export PATH="$NVM_NODE_BIN:$PATH"
fi
if [[ "${1:-}" == "--run" ]]; then
  shift
  if [[ $# -eq 0 ]]; then echo "--run requires a pnpm command" >&2; exit 2; fi
  exec pnpm "$@"
fi

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
  if [[ "${JOVIE_CODEX_SECRET_FREE:-0}" == "1" ]]; then
    node "$REPO_ROOT/scripts/codex-cloud-setup.mjs" >&2
    bash "$REPO_ROOT/scripts/hooks/configure-git-hooks.sh" >&2
    emit_session_start_json "Jovie secret-free dependencies prepared. Authenticated app, database, and native checks still require their own environment."
    exit 0
  fi
  # setup.sh cheap-exits when the worktree is already healthy. GBrain sync
  # below is independent and always runs — do not skip it on a warm setup.
  bash "$REPO_ROOT/scripts/setup.sh" "$@" >&2
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
  if [[ "${JOVIE_CODEX_SECRET_FREE:-0}" == "1" ]]; then
    node "$REPO_ROOT/scripts/codex-cloud-setup.mjs"
    exec bash "$REPO_ROOT/scripts/hooks/configure-git-hooks.sh"
  fi
  bash "$REPO_ROOT/scripts/setup.sh" "$@"
  if [[ -f "$REPO_ROOT/scripts/codex-gbrain-sync.sh" ]]; then
    bash "$REPO_ROOT/scripts/codex-gbrain-sync.sh" session-start || true
  fi
fi
