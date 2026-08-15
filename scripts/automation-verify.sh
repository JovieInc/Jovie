#!/usr/bin/env bash

set -euo pipefail

SCOPE="${1:-affected}"

# Self-select a repo-conforming Node when run standalone (JOV-4329); a no-op
# when invoked through pre-push-gate.sh, which already resolved it.
if ! RESOLVED_NODE_BIN="$(bash scripts/hooks/resolve-repo-node.sh)"; then
  exit 1
fi
if [[ -n "$RESOLVED_NODE_BIN" ]]; then
  echo "[automation-verify] using repo-pinned Node at $RESOLVED_NODE_BIN (ambient: $(node --version 2>/dev/null || echo none))"
  export PATH="$RESOLVED_NODE_BIN:$PATH"
fi

case "$SCOPE" in
  affected)
    echo "[automation-verify] Running affected verify bundle"
    # A pre-push hook must validate the commits that are about to leave this
    # branch, not every commit since main.  Using origin/main here made a
    # long-lived branch rerun the full suite on every push after any broad
    # earlier change (for example a lockfile or auth migration).  Prefer the
    # branch's remote-tracking ref; brand-new branches still fall back to main.
    if [[ -n "${AUTOMATION_VERIFY_BASE:-}" ]]; then
      BASE_REF="$AUTOMATION_VERIFY_BASE"
    elif UPSTREAM_REF="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null)" && \
      git rev-parse --verify --quiet "${UPSTREAM_REF}^{commit}" >/dev/null; then
      BASE_REF="$UPSTREAM_REF"
    else
      BASE_REF="origin/main"
    fi
    if ! git rev-parse --verify --quiet "${BASE_REF}^{commit}" >/dev/null; then
      echo "[automation-verify] Cannot resolve affected-test base: ${BASE_REF}" >&2
      exit 1
    fi
    echo "[automation-verify] affected base: ${BASE_REF}"
    node scripts/turbo-local.mjs typecheck --affected
    node scripts/turbo-local.mjs lint --affected
    # Turbo's --affected flag selects packages, not tests. Any apps/web edit
    # therefore ran the entire web suite locally. Let Vitest follow the changed
    # module graph instead, while retaining the deterministic risk-policy gate.
    AFFECTED_ARGS=(
      --base "$BASE_REF"
      --max-workers "${AUTOMATION_VERIFY_MAX_WORKERS:-2}"
      --shard-concurrency "${AUTOMATION_VERIFY_SHARD_CONCURRENCY:-1}"
    )
    if [[ "${AUTOMATION_VERIFY_PUSH_LANE:-}" == "1" ]]; then
      AFFECTED_ARGS+=(--fast)
    fi
    node scripts/run-affected-tests.mjs \
      "${AFFECTED_ARGS[@]}"
    pnpm ci:harness:check
    ;;
  full)
    echo "[automation-verify] Running full verify bundle"
    node scripts/turbo-local.mjs typecheck
    node scripts/turbo-local.mjs lint
    node scripts/turbo-local.mjs test
    ;;
  *)
    echo "Usage: scripts/automation-verify.sh [affected|full]"
    exit 1
    ;;
esac
