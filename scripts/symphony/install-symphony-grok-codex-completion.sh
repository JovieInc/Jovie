#!/usr/bin/env bash
# install-symphony-grok-codex-completion.sh — verify-only by default.
#
# Copies scripts/symphony/symphony-grok-codex-completion into ~/.local/bin
# only with --apply, and only from an exact origin/main checkout whose
# source file is clean. Default --check compares the installed file and
# writes nothing.
#
# This script does not start or restart units, does not read or write
# credentials, does not edit proof-context.json, and does not set ALLOW.
# SYMPHONY_GROK_COMPLETION_HOME overrides the target home (tests only).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_HOME="${SYMPHONY_GROK_COMPLETION_HOME:-$HOME}"
SOURCE="$REPO_ROOT/scripts/symphony/symphony-grok-codex-completion"
DEST="$TARGET_HOME/.local/bin/symphony-grok-codex-completion"
CHECK=0
APPLY=0

for arg in "$@"; do
  case "$arg" in
    --check) CHECK=1 ;;
    --apply) APPLY=1 ;;
    -h|--help)
      echo "usage: $0 [--check | --apply]"
      exit 0
      ;;
    *)
      echo "usage: $0 [--check | --apply]" >&2
      exit 2
      ;;
  esac
done

if [[ "$CHECK" -eq 1 && "$APPLY" -eq 1 ]]; then
  echo "usage: $0 [--check | --apply]" >&2
  exit 2
fi

if [[ ! -f "$SOURCE" || -L "$SOURCE" ]]; then
  echo "MISSING_SOURCE $SOURCE" >&2
  exit 2
fi

check_dest() {
  if [[ -L "$DEST" ]]; then
    echo "SYMLINK $DEST" >&2
    return 1
  fi
  if [[ ! -f "$DEST" ]]; then
    echo "MISSING $DEST" >&2
    return 1
  fi
  if cmp -s "$SOURCE" "$DEST"; then
    echo "OK $DEST"
    return 0
  fi
  echo "DRIFT $DEST" >&2
  return 1
}

if [[ "$APPLY" -eq 0 ]]; then
  if check_dest; then
    exit 0
  fi
  exit 1
fi

head_sha="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null)" || {
  echo "NOT_A_GIT_CHECKOUT $REPO_ROOT" >&2
  exit 2
}
main_sha="$(git -C "$REPO_ROOT" rev-parse origin/main 2>/dev/null)" || {
  echo "ORIGIN_MAIN_UNAVAILABLE $REPO_ROOT" >&2
  exit 2
}
if [[ "$head_sha" != "$main_sha" ]]; then
  echo "NOT_EXACT_MAIN head=$head_sha origin/main=$main_sha" >&2
  exit 2
fi
if ! git -C "$REPO_ROOT" diff --quiet -- scripts/symphony/symphony-grok-codex-completion \
  || ! git -C "$REPO_ROOT" diff --cached --quiet -- scripts/symphony/symphony-grok-codex-completion; then
  echo "DIRTY_SOURCES scripts/symphony/symphony-grok-codex-completion" >&2
  exit 2
fi

mkdir -p "$(dirname "$DEST")"
if [[ -L "$DEST" || ( -e "$DEST" && ! -f "$DEST" ) ]]; then
  echo "REFUSING $DEST" >&2
  exit 2
fi
if [[ -f "$DEST" ]] && ! cmp -s "$SOURCE" "$DEST"; then
  backup="$DEST.bak.$(date -u +%Y%m%dT%H%M%SZ)"
  cp -p "$DEST" "$backup"
  echo "BACKUP $backup"
fi
install -m 0755 "$SOURCE" "$DEST"
echo "INSTALLED $DEST"
