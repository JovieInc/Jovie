#!/usr/bin/env bash

set -euo pipefail

SCOPE="${1:-affected}"

case "$SCOPE" in
  affected)
    echo "[automation-verify] Running affected verify bundle"
    pnpm turbo typecheck --affected
    pnpm turbo lint --affected
    pnpm turbo test --affected
    ;;
  full)
    echo "[automation-verify] Running full verify bundle"
    pnpm turbo typecheck
    pnpm turbo lint
    pnpm turbo test
    ;;
  *)
    echo "Usage: scripts/automation-verify.sh [affected|full]"
    exit 1
    ;;
esac
