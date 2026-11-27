#!/usr/bin/env bash
# Local runs of the Company Guards size-500 ratchet, in two modes:
#
#   company-size-local.sh            pre-push: HARD FAIL (exit 1) on violations
#   company-size-local.sh --staged   pre-commit: WARN ONLY, staged files only,
#                                    always exit 0, one line, budgeted < 1 s
#   company-size-local.sh --warm     fetch the pinned guard into the cache only
#
# One implementation, zero drift: this does NOT re-implement the guard. Both
# modes load JovieInc/ci guards/size.mjs at the exact SHA this repo's
# .github/workflows/company-guards.yml is pinned to (the same file CI executes)
# and use its own LIMIT / measure() / check() with the committed baseline
# (.company-guards/size-baseline.json, or Jovie's scripts/company-guards/ copy).
# No threshold, extension list or skip pattern is restated here.
#
# Thresholds therefore come from the pinned guard (today: 500 lines per code
# file; baselined files may not grow; new files over the limit fail; tests are
# NOT exempt).
#
# Local failure modes are fail-OPEN (warn + exit 0): no node, no network, no
# access to JovieInc/ci. CI's Company Guards stays the authoritative,
# fail-closed gate. Bypass for one push: `git push --no-verify` (CI still runs).
# Kill switches: JOVIE_SIZE_GUARD_LOCAL=0 (both modes), JOVIE_SIZE_PRECOMMIT=0
# (pre-commit warning only), JOVIE_SIZE_PRECOMMIT_WARM=0 (no background fetch).
set -euo pipefail

MODE=push
case "${1:-}" in
  --staged) MODE=staged ;;
  --warm) MODE=warm ;;
  --staged-inner) MODE=staged-inner ;;
  "") ;;
  *) printf '[size-500/local] unknown argument: %s\n' "$1" >&2; exit 2 ;;
esac

say() { printf '[size-500/local] %s\n' "$*" >&2; }

# Pre-commit must never block or slow a commit: every exit path is 0 and the
# whole mode runs in a subshell whose status is ignored.
if [[ "$MODE" == "staged" ]]; then
  ( set +e
    [[ "${JOVIE_SIZE_GUARD_LOCAL:-1}" == "0" || "${JOVIE_SIZE_PRECOMMIT:-1}" == "0" ]] && exit 0
    "$BASH" "${BASH_SOURCE[0]}" --staged-inner
  ) || true
  exit 0
fi

if [[ "$MODE" == "push" && "${JOVIE_SIZE_GUARD_LOCAL:-1}" == "0" ]]; then
  say "skipped (JOVIE_SIZE_GUARD_LOCAL=0); CI Company Guards still enforces"
  exit 0
fi

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { [[ "$MODE" == "push" ]] && say "not in a git worktree; skipping"; exit 0; }
cd "$ROOT"
WF=".github/workflows/company-guards.yml"
[[ -f "$WF" ]] || { [[ "$MODE" == "push" ]] && say "no $WF; nothing to mirror"; exit 0; }
if ! command -v node >/dev/null 2>&1; then
  [[ "$MODE" == "push" ]] && say "node not found; size-500 not checked locally (CI enforces)"
  exit 0
fi

# Pin: prefer the explicit `# ci-ref: <sha>` line, else the reusable-workflow `uses:@<sha>`.
PIN="$(sed -n 's/^# ci-ref: \([0-9a-f]\{40\}\)$/\1/p' "$WF" | head -1)"
if [[ -z "$PIN" ]]; then
  PIN="$(sed -n 's#.*JovieInc/ci/\.github/workflows/company-guards\.yml@\([0-9a-f]\{40\}\).*#\1#p' "$WF" | head -1)"
fi
[[ "$PIN" =~ ^[0-9a-f]{40}$ ]] || { [[ "$MODE" == "push" ]] && say "could not read the JovieInc/ci pin from $WF; skipping"; exit 0; }

CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/jovie-ci/$PIN"

# Fetch the pinned guard once into the cache. The commit SHA pins the content.
# Uses whatever git credential helper the environment already has; never
# prompts, never writes credentials, bounded in time.
fetch_pin() (
  local tmp git_var
  # Hooks export the caller's Git directory and index. Clear them only in
  # this child repository; staged measurement below must retain that index.
  while IFS= read -r git_var; do unset "$git_var"; done < <(git rev-parse --local-env-vars)
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/jovie-ci.XXXXXX")" || return 1
  if GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never timeout 30s \
       git -c core.hooksPath=/dev/null -C "$tmp" init -q 2>/dev/null &&
     GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never timeout 30s \
       git -c core.hooksPath=/dev/null -C "$tmp" fetch -q --depth=1 \
       "${JOVIE_CI_REMOTE:-https://github.com/JovieInc/ci.git}" "$PIN" 2>/dev/null &&
     git -C "$tmp" -c advice.detachedHead=false checkout -q FETCH_HEAD -- guards canon 2>/dev/null; then
    mkdir -p "$(dirname "$CACHE")"
    rm -rf "$CACHE.partial.$$" && mkdir -p "$CACHE.partial.$$"
    cp -R "$tmp/guards" "$tmp/canon" "$CACHE.partial.$$/"
    mv "$CACHE.partial.$$" "$CACHE" 2>/dev/null || rm -rf "$CACHE.partial.$$"  # another run won the race
    rm -rf "$tmp"
    return 0
  fi
  rm -rf "$tmp"
  return 1
)

if [[ "$MODE" == "warm" ]]; then
  [[ -f "$CACHE/guards/size.mjs" ]] && exit 0
  lock="$CACHE.warming"
  mkdir -p "$(dirname "$CACHE")" 2>/dev/null || exit 0
  # One warmer at a time; a lock older than 10 minutes is stale.
  find "$(dirname "$CACHE")" -maxdepth 1 -name "$PIN.warming" -mmin +10 -exec rmdir {} \; 2>/dev/null || true
  mkdir "$lock" 2>/dev/null || exit 0
  fetch_pin || true
  rmdir "$lock" 2>/dev/null || true
  exit 0
fi

if [[ "$MODE" == "staged-inner" ]]; then
  if [[ ! -f "$CACHE/guards/size.mjs" ]]; then
    # Never fetch on the commit path. Warm the cache in the background for the
    # next commit; pre-push fetches synchronously anyway.
    if [[ "${JOVIE_SIZE_PRECOMMIT_WARM:-1}" != "0" ]]; then
      nohup "$BASH" "${BASH_SOURCE[0]}" --warm </dev/null >/dev/null 2>&1 &
    fi
    exit 0
  fi
  budget="${JOVIE_SIZE_PRECOMMIT_TIMEOUT_MS:-800}"
  [[ "$budget" =~ ^[0-9]{2,4}$ ]] || budget=800
  # Our node only: no inherited --require/--import hooks or module paths.
  env -u NODE_OPTIONS -u NODE_PATH node --input-type=module -e '
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
// argv[1] is a sentinel: the guard runs its CLI when argv[1] equals its own
// path, and we only want its exports.
const [, guardPath, budgetArg] = process.argv.slice(1);
const budget = Number(budgetArg);
const t0 = Date.now();
const left = () => Math.max(50, budget - (Date.now() - t0));
const git = (args, input) => execFileSync("git", args, {
  input, maxBuffer: 512 * 1024 * 1024, timeout: left(), stdio: ["pipe", "pipe", "ignore"],
});
try {
const g = await import(pathToFileURL(guardPath).href);
// Staged additions/modifications, NUL-separated (newlines/spaces in paths are safe).
// Respects GIT_INDEX_FILE, so `git commit <paths>` partial commits are measured right.
const staged = git(["diff", "--cached", "--name-only", "-z", "--no-renames", "--diff-filter=ACMR"])
  .toString("utf8").split("\0").filter(Boolean);
if (staged.length) {
// Ask the pinned guard which files it would read (its own extension/skip rules),
// then read only those blobs from the index in one batch.
const wanted = [];
g.measure(staged, (f) => { wanted.push(f); return null; });
const blobs = new Map();
const batchable = wanted.filter((f) => !/[\n\r]/.test(f));
if (batchable.length) {
  const out = git(["cat-file", "--batch"], batchable.map((f) => ":" + f + "\n").join(""));
  let i = 0;
  for (const f of batchable) {
    const nl = out.indexOf(10, i);
    const head = out.subarray(i, nl).toString("utf8").split(" ");
    i = nl + 1;
    if (head[1] !== "blob") continue; // "missing" (e.g. gitlink) -> not measured
    const size = Number(head[2]);
    blobs.set(f, out.subarray(i, i + size).toString("utf8"));
    i += size + 1;
  }
}
for (const f of wanted.filter((f) => /[\n\r]/.test(f))) {
  try { blobs.set(f, git(["cat-file", "blob", ":" + f]).toString("utf8")); } catch {}
}
const current = g.measure(wanted, (f) => blobs.get(f) ?? null);
const readJson = (spec) => { try { return JSON.parse(git(["cat-file", "blob", spec]).toString("utf8")); } catch { return null; } };
const baseline = readJson(":.company-guards/size-baseline.json")
  ?? readJson(":scripts/company-guards/size-baseline.json") ?? {};
const fails = typeof g.check === "function"
  ? g.check(current, baseline, new Set(staged)).fails
  : g.compare(current, baseline);
if (fails.length) {
const clean = (s) => String(s).replace(/[\u0000-\u001f\u007f]/g, "?");
const shown = fails.slice(0, 3).map(clean).join("; ");
const more = fails.length > 3 ? ` (+${fails.length - 3} more)` : "";
process.stderr.write(
  `\u26a0 size-500 warning (commit NOT blocked): ${shown}${more}. ` +
  `Fix: split the file(s) under ${g.LIMIT ?? "the"} lines before pushing; pre-push and CI Company Guards will block this.\n`
);
}
}
} catch (error) {
  // One line, never a stack trace, never a non-zero exit.
  process.stderr.write(`[size-500/local] pre-commit size check skipped (${String(error?.code ?? error?.name ?? "error")}); pre-push still checks\n`);
}
' size-precommit "$CACHE/guards/size.mjs" "$budget" &
  pid=$!
  # Hard watchdog (works on macOS without coreutils `timeout`).
  hard=$(( budget + 400 ))
  ( sleep "$(( hard / 1000 )).$(printf '%03d' $(( hard % 1000 )))"; kill -9 "$pid" 2>/dev/null ) >/dev/null 2>&1 &
  wd=$!
  wait "$pid" 2>/dev/null || true
  kill "$wd" 2>/dev/null || true
  wait "$wd" 2>/dev/null || true
  exit 0
fi

# ---- pre-push (hard fail) ----------------------------------------------------
if [[ ! -f "$CACHE/guards/size.mjs" ]] && ! fetch_pin; then
  say "could not fetch JovieInc/ci@${PIN:0:12}; size-500 not checked locally (CI enforces)"
  exit 0
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
trap 'cleanup_baseline' EXIT

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
