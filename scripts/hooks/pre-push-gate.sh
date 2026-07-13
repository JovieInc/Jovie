#!/usr/bin/env bash
# Jovie pre-push validation gate (JOV-3200 / OWL no-mistakes pilot).
# Shared entrypoint for:
#   - .husky/pre-push (local git hook)
#   - .no-mistakes.yaml commands (AI validation pipeline)
#
# Escape hatch: JOVIE_SKIP_PRE_PUSH_GATE=1 git push
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

if [[ "${JOVIE_SKIP_PRE_PUSH_GATE:-}" == "1" ]]; then
  echo "[pre-push-gate] skipped (JOVIE_SKIP_PRE_PUSH_GATE=1)"
  exit 0
fi

MODE="${1:-lint}"

run_lint() {
  # Mirrors root `pnpm run pre-push` — fast, deterministic checks only (no tests).
  pnpm run pre-push
}

run_test() {
  pnpm --filter=@jovie/web run test:fast
}

run_affected() {
  # Keep pushes independent of the full repository suite while catching the
  # changed surface before CI has to spend a runner on it.
  run_lint
  bash scripts/automation-verify.sh affected
}

run_format() {
  pnpm biome check --write .
}

case "$MODE" in
  lint)
    run_lint
    ;;
  test)
    run_test
    ;;
  affected)
    run_affected
    ;;
  format)
    run_format
    ;;
  all)
    run_lint
    run_test
    ;;
  *)
    echo "usage: scripts/hooks/pre-push-gate.sh [lint|test|affected|format|all]" >&2
    exit 2
    ;;
esac
