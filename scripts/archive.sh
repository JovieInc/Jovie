#!/usr/bin/env bash
# Archiving is a request, not evidence that nested worktrees or allocations were
# released. Delegate candidate reporting; never traverse/delete workspace roots
# or prune shared Git metadata here.
set -euo pipefail
if [[ $# -gt 0 ]]; then
  echo "Usage: $0" >&2
  exit 2
fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "Archive cleanup deferred: verified task/allocation release is required."
exec bash "$SCRIPT_DIR/codex-cleanup.sh" --dry-run
