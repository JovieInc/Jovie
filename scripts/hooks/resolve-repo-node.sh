#!/usr/bin/env bash
# Resolve a repo-conforming Node for the pre-push gate (JOV-4329).
#
# The gate must not inherit whatever Node happens to be on the shell's PATH.
# On the orchestration host an older Node on PATH can violate engines
# (`>=24.21.0 <25`) and fail the runner-prerequisite contract tests:
# verify-prerequisites.mjs --write-marker rejects any Node older than .nvmrc,
# so shard 7/8 reported exactly 3 failures under a stale major and passed
# under the .nvmrc-pinned 24.21.0.
#
# Behavior:
#   - ambient `node` already satisfies .nvmrc (same major, >= pinned): exit 0,
#     print nothing (caller keeps PATH as-is);
#   - ambient `node` violates .nvmrc but the pinned install exists under nvm:
#     print the bin directory to prepend to PATH, exit 0;
#   - ambient `node` violates .nvmrc but the pinned build is in the setup cache
#     (~/.cache/jovie-node), or can be fetched there checksum-verified from
#     nodejs.org: print that bin directory, exit 0. Cloud agents start on an
#     older Node with no nvm, so this keeps them from stalling at push time.
#     JOVIE_NODE_AUTOFETCH=0 turns the fetch off;
#   - otherwise: print an actionable message to stderr, exit 1. Failing fast
#     beats discovering the mismatch as 3 opaque test failures mid-gate.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PINNED="$(tr -d '[:space:]' < "$REPO_ROOT/.nvmrc")"
PINNED="${PINNED#v}"

satisfies() {
  # $1 = candidate version (vX.Y.Z), $2 = pinned minimum (X.Y.Z).
  # Conforming means same major and >= pinned (mirrors engines `>=PINNED <major+1`).
  local candidate="${1#v}"
  local c_major c_minor c_patch p_major p_minor p_patch
  IFS='.' read -r c_major c_minor c_patch <<<"$candidate"
  IFS='.' read -r p_major p_minor p_patch <<<"$2"
  [[ "${c_major:-0}" == "${p_major:-0}" ]] || return 1
  (( ${c_minor:-0} > ${p_minor:-0} )) && return 0
  (( ${c_minor:-0} < ${p_minor:-0} )) && return 1
  (( ${c_patch:-0} >= ${p_patch:-0} ))
}

CURRENT="$(node --version 2>/dev/null || true)"
if [[ -n "$CURRENT" ]] && satisfies "$CURRENT" "$PINNED"; then
  exit 0
fi

NVM_VERSIONS="${NVM_DIR:-${HOME:-}/.nvm}/versions/node"
if [[ -x "$NVM_VERSIONS/v$PINNED/bin/node" ]]; then
  echo "$NVM_VERSIONS/v$PINNED/bin"
  exit 0
fi

case "$(uname -s)" in Linux) OS=linux ;; Darwin) OS=darwin ;; *) OS="" ;; esac
case "$(uname -m)" in x86_64 | amd64) ARCH=x64 ;; arm64 | aarch64) ARCH=arm64 ;; *) ARCH="" ;; esac
CACHE_BIN="${JOVIE_NODE_CACHE_DIR:-${XDG_CACHE_HOME:-${HOME:-}/.cache}/jovie-node}/node-v$PINNED-$OS-$ARCH/bin"
if [[ -n "$OS" && -n "$ARCH" ]]; then
  if [[ ! -x "$CACHE_BIN/node" && "${JOVIE_NODE_AUTOFETCH:-1}" != "0" &&
    -f "$REPO_ROOT/scripts/lib/setup-worktree-health.sh" ]]; then
    echo "[resolve-repo-node] fetching Node $PINNED into the setup cache" >&2
    # shellcheck source=../lib/setup-worktree-health.sh
    source "$REPO_ROOT/scripts/lib/setup-worktree-health.sh"
    jovie_setup_ensure_pinned_node "$REPO_ROOT" >/dev/null 2>&1 || true
  fi
  if [[ -x "$CACHE_BIN/node" ]]; then
    echo "$CACHE_BIN"
    exit 0
  fi
fi

echo "[resolve-repo-node] ambient Node ${CURRENT:-not found} does not satisfy .nvmrc ($PINNED) and no pinned install exists at $NVM_VERSIONS/v$PINNED" >&2
echo "[resolve-repo-node] install it (nvm install $PINNED) or re-run with a conforming Node on PATH" >&2
exit 1
