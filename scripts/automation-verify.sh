#!/usr/bin/env bash

set -euo pipefail

SCOPE="${1:-affected}"

case "$SCOPE" in
  affected)
    echo "[automation-verify] Running affected verify bundle"
    BASE_REF="${AUTOMATION_VERIFY_BASE:-origin/main}"
    if ! git rev-parse --verify --quiet "${BASE_REF}^{commit}" >/dev/null; then
      echo "[automation-verify] Cannot resolve affected-test base: ${BASE_REF}" >&2
      exit 1
    fi
    node scripts/turbo-local.mjs typecheck --affected
    node scripts/turbo-local.mjs lint --affected
    # Turbo's --affected flag selects packages, not tests. Any apps/web edit
    # therefore ran the entire web suite locally. Let Vitest follow the changed
    # module graph instead, while retaining the deterministic risk-policy gate.
    node scripts/run-affected-tests.mjs \
      --base "$BASE_REF" \
      --max-workers "${AUTOMATION_VERIFY_MAX_WORKERS:-2}"
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
