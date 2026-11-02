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

# Git exports repository-local routing into hooks. Clear it before any child
# check creates a fixture repository (as buildVerificationEnv does for affected
# tests), so child Git commands discover their own repository from their cwd.
# Use Git's complete list; preserve unrelated authentication and network env.
git_local_env_names="$(git rev-parse --local-env-vars)"
while IFS= read -r git_local_env_name; do
  # An empty list still yields one empty line from the here-string; skip it,
  # since `unset ""` is an error that aborts the gate (seen in the fixture test).
  if [ -n "$git_local_env_name" ]; then
    unset "$git_local_env_name"
  fi
done <<< "$git_local_env_names"
unset git_local_env_names git_local_env_name

# Recursion guard (incident 2026-11-01, Gem load 1,661): preflight sets
# JOVIE_PREFLIGHT_DEPTH for its children, so a gate that finds it set was
# re-entered from inside a preflight and must refuse rather than fork-storm.
if [[ -n "${JOVIE_PREFLIGHT_DEPTH:-}" ]]; then
  echo "[pre-push-gate] refusing to run: nested inside a preflight (JOVIE_PREFLIGHT_DEPTH=${JOVIE_PREFLIGHT_DEPTH})" >&2
  exit 1
fi

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
  # One pass over every changed-file step Source Validation runs, listing all
  # failures (derived from the workflow, so it cannot drift). JOVIE_PREFLIGHT=0
  # skips it; JOVIE_SKIP_PRE_PUSH_GATE is the only other escape hatch.
  echo "[pre-push-gate] running preflight"
  node scripts/preflight.mjs --hook
  # JOV-9727: path-scoped rules, PR body and companion edits. JOVIE_PREFLIGHT_CHANGED=0 skips it.
  echo "[pre-push-gate] running preflight:changed"
  node scripts/preflight-changed.mjs --hook --no-typecheck --no-coverage
  bash scripts/automation-verify.sh affected
}

run_publication() {
  # Draft publication is a feedback start, not a promotion qualification.
  # Keep the committed diff safe, then let rolling CI evaluate the broader
  # affected surface while implementation continues.
  local head_ref publication_base
  head_ref="$(git branch --show-current)"
  node scripts/ci-branching-guard.mjs check \
    --head "$head_ref" --base main --mode warn
  git rev-parse --verify HEAD >/dev/null
  git diff --check
  git diff --cached --check
  if ! publication_base="$(git merge-base origin/main HEAD)"; then
    echo "[pre-push-gate] cannot resolve publication range; fetch origin/main and restore shared history before publishing" >&2
    return 1
  fi
  git diff --check "${publication_base}..HEAD"
  # Reuse the changed-file Biome guard so formatter failures never reach CI.
  bash scripts/hooks/biome-pre-push.sh
  # Catch missing component tests/stories before another Source Validation run.
  node scripts/component-ship-gate.mjs --check-artifacts --diff-base="$publication_base"
  bash scripts/security/scan-secrets.sh publication origin/main
  node scripts/lib/policy-gate-liveness.mjs
  node --test scripts/hooks/pre-push-gate.test.mjs
  # Same path-scoped Source Validation guards CI runs (one manifest:
  # scripts/lib/source-validation-manifest.mjs), static checks only (--fast).
  # JOVIE_PREFLIGHT_CHANGED=0 skips it.
  echo "[pre-push-gate] running preflight:changed (fast)"
  node scripts/preflight-changed.mjs --hook --fast
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
