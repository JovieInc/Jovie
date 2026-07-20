#!/usr/bin/env bash
# Resolve a repo-conforming Node for the pre-push gate (JOV-4329).
#
# The gate must not inherit whatever Node happens to be on the shell's PATH.
# On the orchestration host the default is pnpm's Node 22.22.1, which violates
# engines (`>=22.23.1 <23`) and fails the runner-prerequisite contract tests:
# verify-prerequisites.mjs --write-marker rejects any Node older than .nvmrc,
# so shard 7/8 reported exactly 3 failures under 22.22.1 and passed under the
# .nvmrc-pinned 22.23.1.
#
# Behavior:
#   - ambient `node` already satisfies .nvmrc (same major, >= pinned): exit 0,
#     print nothing (caller keeps PATH as-is);
#   - ambient `node` violates .nvmrc but the pinned install exists under nvm:
#     print the bin directory to prepend to PATH, exit 0;
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

echo "[resolve-repo-node] ambient Node ${CURRENT:-not found} does not satisfy .nvmrc ($PINNED) and no pinned install exists at $NVM_VERSIONS/v$PINNED" >&2
echo "[resolve-repo-node] install it (nvm install $PINNED) or re-run with a conforming Node on PATH" >&2
exit 1
