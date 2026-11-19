#!/usr/bin/env bash
# Local pre-push run of the Company Guards size-500 ratchet.
#
# One implementation, zero drift: this does NOT re-implement the guard. It runs
# JovieInc/ci guards/size.mjs at the exact SHA this repo's
# .github/workflows/company-guards.yml is pinned to (the same file CI executes),
# against the same baseline (.company-guards/size-baseline.json), with the same
# scope rules (repo-wide unless the repo's workflow diff-scopes via SIZE_BASE_SHA).
#
# Thresholds therefore come from the pinned guard: 500 lines per code file
# (.ts .tsx .js .jsx .mjs .cjs .py .swift .ex .exs .sh .rb .go .rs), skipping
# node_modules/vendor/dist/build/.next/Pods dirs, *.gen.*, *.generated.*,
# *.min.*, *.d.ts and any path containing "lock"; baselined files may not grow,
# new files over 500 fail. Tests are NOT exempt (same as CI).
#
# Local failure modes are fail-OPEN (warn + exit 0): no node, no network, no
# access to JovieInc/ci. CI's Company Guards stays the authoritative,
# fail-closed gate. Bypass for one push: `git push --no-verify` (CI still runs).
# Kill switch: JOVIE_SIZE_GUARD_LOCAL=0.
set -euo pipefail

say() { printf '[size-500/local] %s\n' "$*" >&2; }

if [[ "${JOVIE_SIZE_GUARD_LOCAL:-1}" == "0" ]]; then
  say "skipped (JOVIE_SIZE_GUARD_LOCAL=0); CI Company Guards still enforces"
  exit 0
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
WF=".github/workflows/company-guards.yml"
[[ -f "$WF" ]] || { say "no $WF; nothing to mirror"; exit 0; }
command -v node >/dev/null 2>&1 || { say "node not found; skipping (CI enforces)"; exit 0; }

# Pin: prefer the explicit `# ci-ref: <sha>` line, else the reusable-workflow `uses:@<sha>`.
PIN="$(sed -n 's/^# ci-ref: \([0-9a-f]\{40\}\)$/\1/p' "$WF" | head -1)"
if [[ -z "$PIN" ]]; then
  PIN="$(sed -n 's#.*JovieInc/ci/\.github/workflows/company-guards\.yml@\([0-9a-f]\{40\}\).*#\1#p' "$WF" | head -1)"
fi
[[ "$PIN" =~ ^[0-9a-f]{40}$ ]] || { say "could not read the JovieInc/ci pin from $WF; skipping"; exit 0; }

CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/jovie-ci/$PIN"
if [[ ! -f "$CACHE/guards/size.mjs" ]]; then
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/jovie-ci.XXXXXX")"
  trap 'rm -rf "$tmp"' EXIT
  # Uses whatever git credential helper the environment already has; never
  # prompts, never writes credentials, bounded in time.
  if GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never timeout 30s \
       git -c core.hooksPath=/dev/null -C "$tmp" init -q 2>/dev/null &&
     GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never timeout 30s \
       git -c core.hooksPath=/dev/null -C "$tmp" fetch -q --depth=1 \
       "${JOVIE_CI_REMOTE:-https://github.com/JovieInc/ci.git}" "$PIN" 2>/dev/null &&
     git -C "$tmp" -c advice.detachedHead=false checkout -q FETCH_HEAD -- guards canon 2>/dev/null; then
    mkdir -p "$(dirname "$CACHE")"
    rm -rf "$CACHE.partial" && mkdir -p "$CACHE.partial"
    cp -R "$tmp/guards" "$tmp/canon" "$CACHE.partial/"
    mv "$CACHE.partial" "$CACHE" 2>/dev/null || rm -rf "$CACHE.partial"  # another push won the race
  else
    say "could not fetch JovieInc/ci@${PIN:0:12}; size-500 not checked locally (CI enforces)"
    exit 0
  fi
fi

# Baseline: consumers keep it at .company-guards/; Jovie keeps it under
# scripts/company-guards/ and CI copies it into place. Mirror the copy without
# touching a tracked file, and clean up after.
CREATED_BASELINE=0
if [[ ! -f .company-guards/size-baseline.json && -f scripts/company-guards/size-baseline.json ]]; then
  mkdir -p .company-guards
  cp scripts/company-guards/size-baseline.json .company-guards/size-baseline.json
  CREATED_BASELINE=1
fi
cleanup_baseline() {
  if [[ "$CREATED_BASELINE" == "1" ]]; then
    rm -f .company-guards/size-baseline.json
    rmdir .company-guards 2>/dev/null || true
  fi
}
trap 'cleanup_baseline; rm -rf "${tmp:-}"' EXIT

# Scope exactly like this repo's CI: diff-scoped only when the workflow sets
# SIZE_BASE_SHA (Jovie today), repo-wide otherwise (reusable-workflow consumers).
unset GITHUB_EVENT_NAME SIZE_BASE_SHA
if grep -q 'SIZE_BASE_SHA' "$WF"; then
  base="${JOVIE_SIZE_BASE:-$(git merge-base "${JOVIE_PUSH_BASE_REF:-origin/main}" HEAD 2>/dev/null || true)}"
  if [[ -n "$base" ]]; then
    export GITHUB_EVENT_NAME=pull_request SIZE_BASE_SHA="$base"
  fi
fi

# The guard reads the working tree; CI reads the pushed commit. Say so when they differ.
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  say "warning: uncommitted tracked changes are included in this local count; CI measures the pushed commit"
fi

if node "$CACHE/guards/size.mjs"; then
  exit 0
fi
say "BLOCKED: the same size-500 check Company Guards runs in CI failed (pin ${PIN:0:12})."
say "Fix: split the file (preferred) or shrink it. Budgets never rise; there is no label override."
say "One-off bypass: git push --no-verify (CI will still fail this PR)."
exit 1
