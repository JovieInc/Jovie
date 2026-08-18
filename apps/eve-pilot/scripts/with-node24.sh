#!/usr/bin/env bash
# Run a command on Node >= 24 so Eve works even when the parent shell is Node 22.
set -euo pipefail

node_major() {
  "$1" -p "process.versions.node.split('.')[0]" 2>/dev/null || true
}

pick_node24() {
  if command -v node >/dev/null 2>&1; then
    if [[ "$(node_major "$(command -v node)")" -ge 24 ]]; then
      command -v node
      return 0
    fi
  fi

  local nvm_root="${NVM_DIR:-$HOME/.nvm}/versions/node"
  local latest=""
  if [[ -d "$nvm_root" ]]; then
    latest="$(ls -1d "$nvm_root"/v24.* 2>/dev/null | sort -V | tail -1 || true)"
    if [[ -n "$latest" && -x "$latest/bin/node" ]]; then
      echo "$latest/bin/node"
      return 0
    fi
  fi

  local candidate
  for candidate in \
    /opt/homebrew/opt/node@24/bin/node \
    /usr/local/opt/node@24/bin/node
  do
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done

  return 1
}

NODE24="$(pick_node24)" || {
  echo "eve-pilot requires Node.js >= 24 (Eve 0.27.8)." >&2
  echo "Install it with: nvm install 24" >&2
  echo "Then re-run this command. The monorepo root can stay on Node 22." >&2
  exit 1
}

export PATH="$(dirname "$NODE24"):$PATH"
if [[ "$(node_major node)" -lt 24 ]]; then
  echo "Failed to put Node >= 24 on PATH (found $(node -v))." >&2
  exit 1
fi

exec "$@"
