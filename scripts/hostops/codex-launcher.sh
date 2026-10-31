#!/usr/bin/env bash
# codex: fleet launcher for the Codex CLI, installed as ~/.local/bin/codex by
# scripts/hostops/install-hostops-tools.sh. Moved here from the retired
# Hermes codex launcher on 2026-10-31.
#
# Policy, unchanged from the Hermes launcher:
#   - every non-`mcp` run gets --dangerously-bypass-approvals-and-sandbox and
#     --skip-git-repo-check, because fleet agents run Codex unattended;
#   - `-a/--ask-for-approval/--approach <value>` is dropped (it conflicts with
#     the bypass flag). -C and -m pass through: current Codex accepts them.
#   - a non-interactive `codex exec` gets stdin closed unless the prompt is
#     read from stdin (`-`). With an inherited stdin that never closes, Codex
#     waits forever for extra input (a 9h hang on 2026-10-31). Piped prompts
#     must therefore pass `-`.
# CODEX_REAL_BIN overrides which Codex binary runs.
set -euo pipefail

resolve_codex_bin() {
  if [[ -n "${CODEX_REAL_BIN:-}" ]]; then
    printf '%s\n' "$CODEX_REAL_BIN"
    return 0
  fi
  local candidate
  for candidate in \
    /Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex \
    /Applications/Codex.app/Contents/Resources/codex \
    /opt/homebrew/bin/codex \
    /usr/local/bin/codex \
    "$HOME/.npm-global/bin/codex"; do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

if ! CODEX_BIN="$(resolve_codex_bin)"; then
  echo "codex launcher: no Codex binary found; set CODEX_REAL_BIN" >&2
  exit 127
fi

args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -a | --ask-for-approval | --approach)
      shift
      [[ $# -gt 0 ]] && shift
      ;;
    "") shift ;;
    *)
      args+=("$1")
      shift
      ;;
  esac
done

export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
subcommand="${args[0]:-}"

if [[ "$subcommand" == "exec" && ! -t 0 && " ${args[*]} " != *" - "* ]]; then
  exec </dev/null
fi

if [[ "$subcommand" == "mcp" ]]; then
  exec "$CODEX_BIN" "${args[@]}"
fi
exec "$CODEX_BIN" ${args[@]+"${args[@]}"} --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check
