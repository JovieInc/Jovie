#!/usr/bin/env bash

set -euo pipefail

SCOPE="${1:-affected}"

case "$SCOPE" in
  affected)
    echo "[automation-verify] Running affected verify bundle"
    node scripts/turbo-local.mjs typecheck --affected
    node scripts/turbo-local.mjs lint --affected
    node scripts/turbo-local.mjs test --affected
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
