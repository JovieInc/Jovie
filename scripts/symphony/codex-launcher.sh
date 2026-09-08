#!/usr/bin/env bash
# Stable Codex entrypoint for Hermes/Symphony.
#
# The shipper still emits the legacy -a/-C/-m spellings. Translate those
# spellings to the installed Codex CLI without adding a global approval or
# sandbox bypass. The caller's explicit sandbox and approval policy remain
# authoritative.
set -euo pipefail

if [[ -n "${HERMES_CODEX_BIN:-}" ]]; then
  CODEX_BIN="$HERMES_CODEX_BIN"
elif [[ -x "/Applications/Codex.app/Contents/Resources/codex" ]]; then
  CODEX_BIN="/Applications/Codex.app/Contents/Resources/codex"
elif [[ -x "/Applications/ChatGPT.app/Contents/Resources/codex" ]]; then
  CODEX_BIN="/Applications/ChatGPT.app/Contents/Resources/codex"
else
  echo "No supported Codex binary found. Set HERMES_CODEX_BIN to an executable path." >&2
  exit 127
fi

NEW_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -a|--approach)
      [[ $# -ge 2 ]] || { echo "$1 requires a value" >&2; exit 2; }
      NEW_ARGS+=("--ask-for-approval" "$2")
      shift 2
      ;;
    -C)
      [[ $# -ge 2 ]] || { echo "$1 requires a value" >&2; exit 2; }
      NEW_ARGS+=("--cd" "$2")
      shift 2
      ;;
    --sandbox|-m|--model)
      [[ $# -ge 2 ]] || { echo "$1 requires a value" >&2; exit 2; }
      if [[ "$1" == "-m" ]]; then
        NEW_ARGS+=("--model" "$2")
      else
        NEW_ARGS+=("$1" "$2")
      fi
      shift 2
      ;;
    *)
      NEW_ARGS+=("$1")
      shift
      ;;
  esac
done

export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
exec "$CODEX_BIN" "${NEW_ARGS[@]}"
