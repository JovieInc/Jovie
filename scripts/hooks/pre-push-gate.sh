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

# Self-select a repo-conforming Node instead of inheriting the shell's
# (JOV-4329): the ambient Node may violate engines and fail the
# runner-prerequisite contract tests mid-gate.
if ! RESOLVED_NODE_BIN="$(bash scripts/hooks/resolve-repo-node.sh)"; then
  exit 1
fi
if [[ -n "$RESOLVED_NODE_BIN" ]]; then
  echo "[pre-push-gate] using repo-pinned Node at $RESOLVED_NODE_BIN (ambient: $(node --version 2>/dev/null || echo none))"
  export PATH="$RESOLVED_NODE_BIN:$PATH"
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
  # JOV-4421: hard ship gate (diff match + story quality + multi-root ratchet).
  echo "[pre-push-gate] running component-ship-gate"
  pnpm component-ship-gate
  bash scripts/automation-verify.sh affected
}

run_publication() {
  # Draft publication is a feedback start, not a promotion qualification.
  # Keep the committed diff safe, then let rolling CI evaluate the broader
  # affected surface while implementation continues.
  local head_ref
  head_ref="$(git branch --show-current)"
  node scripts/ci-branching-guard.mjs check \
    --head "$head_ref" --base main --mode warn
  git rev-parse --verify HEAD >/dev/null
  git diff --check
  git diff --cached --check
  git diff --check "$(git merge-base origin/main HEAD)..HEAD"
  bash scripts/security/scan-secrets.sh publication origin/main
  node scripts/lib/policy-gate-liveness.mjs
  node --test scripts/hooks/pre-push-gate.test.mjs
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
  publication)
    run_publication
    ;;
  format)
    run_format
    ;;
  all)
    run_lint
    run_test
    ;;
  *)
    echo "usage: scripts/hooks/pre-push-gate.sh [lint|test|affected|publication|format|all]" >&2
    exit 2
    ;;
esac
