#!/usr/bin/env bash
# Graphite-native PR queue drain.
# Classifies every open PR and ENROLLS the clean ones into the Graphite merge
# queue by applying the `merge-queue` label. It also removes that label from
# PRs that cannot currently merge so they stop occupying queue slots.
# Autonomous shipping (2026-07-06): taste gates are advisory — only hold/gated/needs-human block.
#
# It deliberately does NOT:
#   - run `gh pr merge` (branch protection lets only the Graphite app push to
#     main; Graphite rebase-merges enrolled PRs server-side)
#   - retarget to integration/loop-* (agents ship straight to main now)
#   - close PRs (surfaced for a human instead — see the SURFACE bucket)
#
# Buckets that need code work (CONFLICT / BLOCKED) are printed for the
# /drain command to fan out per-PR worktree agents (cheap model for mechanical
# rebases, capable model for semantic conflicts).
#
# Env:
#   DRY_RUN=1   classify and print only; apply no labels
set -euo pipefail

# shellcheck source=./scripts/lib/gh-retry.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/gh-retry.sh"

REPO="${REPO:-JovieInc/Jovie}"
DRY_RUN="${DRY_RUN:-0}"
# Branches that are agent-owned (safe to rebase/force-push in a fix agent).
AGENT_RE='^(tim/|codex/|agent/|claude/|linear/|feat/|dependabot/)'

label() {  # label <num> <label>
  [[ "$DRY_RUN" == "1" ]] && { echo "    [dry-run] would +$2 on #$1"; return 0; }
  gh_retry pr edit "$1" -R "$REPO" --add-label "$2" >/dev/null 2>&1 \
    && echo "    +$2 on #$1" || echo "    !! failed to add $2 on #$1"
}

unlabel() {  # unlabel <num> <label>
  [[ "$DRY_RUN" == "1" ]] && { echo "    [dry-run] would -$2 on #$1"; return 0; }
  gh_retry pr edit "$1" -R "$REPO" --remove-label "$2" >/dev/null 2>&1 \
    && echo "    -$2 on #$1" || echo "    !! failed to remove $2 on #$1"
}

check_failures_for_pr() {  # check_failures_for_pr <num>
  local n="$1"
  local attempts="${GH_RETRY_ATTEMPTS:-5}"
  local base_delay="${GH_RETRY_BASE_DELAY:-2}"
  local max_delay="${GH_RETRY_MAX_DELAY:-30}"
  local attempt=1
  local out_file err_file err delay
  out_file="$(mktemp)"
  err_file="$(mktemp)"

  # TERMINAL failures only. Pending/queued/in-progress mean CI isn't done yet, and
  # `cancelled` is almost always a zombie left by `concurrency: cancel-in-progress`
  # (a superseded run) — none of those are real failures. Counting them as failures
  # is what made the drain loop dequeue green PRs every 20 min and starve the queue
  # for 6h on 2026-06-22. Only FAILURE/ERROR/TIMED_OUT/ACTION_REQUIRED count.
  local jq_filter='[
    .[]
    | select(
        ((.bucket // "") | test("^fail$"; "i"))
        or ((.state // "") | test("^(FAILURE|ERROR|TIMED_OUT|ACTION_REQUIRED|STARTUP_FAILURE)$"; "i"))
      )
    | select(((.name // "") | test("advisory|Preview Deploy|Slop Gate"; "i")) | not)
    | (.name // .workflow // .description // "unnamed check")
  ]'

  while [[ "$attempt" -le "$attempts" ]]; do
    : >"$out_file"
    : >"$err_file"
    if gh pr checks "$n" -R "$REPO" --required --json name,bucket,state,workflow,description --jq "$jq_filter" >"$out_file" 2>"$err_file"; then
      if jq -e 'type == "array"' "$out_file" >/dev/null 2>&1; then
        cat "$out_file"
        rm -f "$out_file" "$err_file"
        return 0
      fi
    elif jq -e 'type == "array"' "$out_file" >/dev/null 2>&1; then
      # `gh pr checks` exits 8 when checks are pending, even with valid JSON.
      cat "$out_file"
      rm -f "$out_file" "$err_file"
      return 0
    fi

    err="$(<"$err_file")"
    if [[ "$attempt" -eq "$attempts" ]] || ! gh_retry_is_transient_error "$err"; then
      [[ -n "$err" ]] && echo "  !! could not read required checks for #$n: $err" >&2
      jq -cn --arg reason "required check status unavailable" '[$reason]'
      rm -f "$out_file" "$err_file"
      return 0
    fi

    delay=$((base_delay * (2 ** (attempt - 1))))
    [[ "$delay" -gt "$max_delay" ]] && delay="$max_delay"
    echo "  [gh-retry] pr checks #$n attempt $attempt/$attempts failed (transient); retrying in ${delay}s…" >&2
    sleep "$delay"
    attempt=$((attempt + 1))
  done

  rm -f "$out_file" "$err_file"
  jq -cn --arg reason "required check status unavailable" '[$reason]'
}

SNAP="$(gh_retry pr list -R "$REPO" --state open --limit 200 \
  --json number,title,isDraft,mergeable,mergeStateStatus,labels,headRefName --jq '
  [ .[] | {
    n: .number,
    t: (.title[0:48]),
    draft: .isDraft,
    m: .mergeable,
    ms: (.mergeStateStatus // "UNKNOWN"),
    head: .headRefName,
    L: [.labels[].name],
    fail: []
  } ]')"

ENRICHED="[]"
while IFS= read -r pr; do
  n="$(jq -r '.n' <<<"$pr")"
  fail="[]"
  if jq -e '
    (.draft | not)
    and (.m == "MERGEABLE")
    and ((.head | startswith("gtmq_")) | not)
    and (([.L[]] | any(. == "needs-human" or . == "hold" or . == "gated" or . == "fast")) | not)
  ' <<<"$pr" >/dev/null; then
    fail="$(check_failures_for_pr "$n")"
  fi
  # Guard: check_failures_for_pr might return non-JSON under transient gh errors.
  # Default to empty array if $fail isn't valid JSON.
  if ! jq -e . <<<"$fail" >/dev/null 2>&1; then
    fail='[]'
  fi
  ENRICHED="$(jq -c --argjson pr "$pr" --argjson fail "$fail" '. + [$pr + {fail: $fail}]' <<<"$ENRICHED")"
done < <(jq -c '.[]' <<<"$SNAP")
SNAP="$ENRICHED"

# --- SUMMARY: make queue shape obvious in scheduled logs ---
echo "=== QUEUE SUMMARY ==="
echo "$SNAP" | jq -r '
  def labels: (.L // []);
  def queued: labels | index("merge-queue");
  def hard_gated: labels | any(. == "needs-human" or . == "hold" or . == "gated");
  [
    "  CLEAN: " + ([.[] | select(queued and (.ms // "") == "CLEAN")] | length | tostring),
    "  UNSTABLE: " + ([.[] | select(queued and (.ms // "") == "UNSTABLE")] | length | tostring),
    "  BLOCKED: " + ([.[] | select(queued and (.ms // "") == "BLOCKED")] | length | tostring),
    "  DIRTY: " + ([.[] | select(queued and (.ms // "") == "DIRTY")] | length | tostring),
    "  hard-gated: " + ([.[] | select(hard_gated)] | length | tostring),
    "  gtmq: " + ([.[] | select((.head // "") | startswith("gtmq_"))] | length | tostring)
  ] | .[]'

# --- DEQUEUE: hard-gated PRs must not occupy Graphite queue slots ---
echo "=== DEQUEUE (hard gates → -merge-queue) ==="
echo "$SNAP" | jq -c '.[]
  | select([.L[]] | index("merge-queue"))
  | select((.head|startswith("gtmq_"))|not)
  | select([.L[]] | any(. == "needs-human" or . == "hold" or . == "gated"))' \
| while read -r pr; do
    n=$(jq -r '.n' <<<"$pr"); t=$(jq -r '.t' <<<"$pr")
    echo "  #$n  $t"
    unlabel "$n" merge-queue
  done

# --- DEQUEUE: only GENUINELY un-mergeable PRs (conflict or real failing checks) ---
# Do NOT dequeue on mergeStateStatus alone. A MERGEABLE PR flickers to BLOCKED
# whenever a required check has a zombie `cancelled`/`queued` run left behind by
# `concurrency: cancel-in-progress` (the ruleset evaluates required checks by
# name and a non-success duplicate pins it BLOCKED). Stripping merge-queue on
# that transient state un-enrolled green PRs every 20 min and starved the queue
# for 6h on 2026-06-22. The raw `mergeable` field has the same flicker:
# GitHub recomputes it asynchronously every time main advances, reporting
# UNKNOWN for the recompute window — on 2026-07-09 that churned three clean
# PRs (13741/13746/13779) through synchronized dequeue/re-enroll cycles.
# Dequeue only on: needs-conflict-resolution, a CONFIRMED merge conflict
# (m == CONFLICTING, never UNKNOWN), or actually-failing checks (.fail).
echo "=== DEQUEUE (conflict / failing → -merge-queue) ==="
echo "$SNAP" | jq -c '.[]
  | select([.L[]] | index("merge-queue"))
  | select((.head|startswith("gtmq_"))|not)
  | select(([.L[]] | any(.=="needs-human" or .=="hold" or .=="gated")) | not)
  | select(
      ([.L[]] | any(.=="needs-conflict-resolution"))
      or (.m == "CONFLICTING")
      or (.fail|length>0)
    )' \
| while read -r pr; do
    n=$(jq -r '.n' <<<"$pr"); t=$(jq -r '.t' <<<"$pr")
    reason=$(jq -r '
      [
        (if ([.L[]] | any(.=="needs-conflict-resolution")) then "needs-conflict-resolution" else empty end),
        (if .m == "CONFLICTING" then "mergeable=CONFLICTING" else empty end),
        (if (.fail|length)>0 then "checks=" + (.fail|join(",")) else empty end)
      ] | join("; ")
    ' <<<"$pr")
    echo "  #$n  $t  ✗ $reason"
    unlabel "$n" merge-queue
  done

# --- ENROLL: non-draft, mergeable, no FAILING checks, not opted-out, not queued ---
# Enroll on mergeable + no actually-failing checks. We deliberately do NOT require
# mergeStateStatus==CLEAN: zombie cancelled/queued required-check runs (from
# cancel-in-progress) pin otherwise-green PRs at BLOCKED, and gating enrollment on
# CLEAN meant those PRs never entered the queue. Enrolling a not-yet-green PR is
# safe — Graphite re-validates and the dequeue step above removes any that truly
# fail. `.fail` only counts terminal failing checks, not pending/queued ones.
echo "=== ENROLL (mergeable + not failing → +merge-queue + auto-merge) ==="
# Honor GRAPHITE_QUEUE_POLICY.maxQueueDepth: this is the primary enrollment
# path, and until 2026-07-09 it was the only one that ignored the cap the
# agent-pipeline/landing-sweep/tick paths all enforce — a mass-green event
# (CI outage recovery, post-rebase wave) could enqueue an unbounded batch and
# saturate Graphite + the runner pool in one pass.
MAX_QUEUE_DEPTH=$(node scripts/ci-merge-queue-check.mjs max-queue-depth 2>/dev/null || echo 16)
QUEUED_NOW=$(echo "$SNAP" | jq '[.[] | select([.L[]] | index("merge-queue"))] | length')
ENROLL_SLOTS=$((MAX_QUEUE_DEPTH - QUEUED_NOW))
[[ "$ENROLL_SLOTS" -lt 0 ]] && ENROLL_SLOTS=0
echo "  queue depth: $QUEUED_NOW/$MAX_QUEUE_DEPTH ($ENROLL_SLOTS slots)"
ENROLLED_THIS_RUN=0
echo "$SNAP" | jq -c '.[]
  | select(.draft|not)
  | select(.m=="MERGEABLE")
  | select(.fail|length==0)
  | select((.head|startswith("gtmq_"))|not)
  | select([.L[]] | any(.=="needs-human" or .=="hold" or .=="gated" or .=="needs-conflict-resolution" or .=="merge-queue" or .=="fast") | not)' \
| while read -r pr; do
    n=$(jq -r '.n' <<<"$pr"); t=$(jq -r '.t' <<<"$pr")
    if [[ "$ENROLLED_THIS_RUN" -ge "$ENROLL_SLOTS" ]]; then
      echo "  #$n  $t  ⏸ deferred (queue at depth cap; next drain pass enrolls)"
      continue
    fi
    ENROLLED_THIS_RUN=$((ENROLLED_THIS_RUN + 1))
    echo "  #$n  $t"
    label "$n" merge-queue
    # Enable GitHub native auto-merge (squash) so the PR merges as soon as
    # CI goes green. The `merge-queue` label alone is a status marker, not a
    # merge trigger — the old mq-guard.sh cron controlled actual auto-merge.
    # Since that cron was disabled during CI consolidation (2026-07-08),
    # this step closes the pipeline gap inline.
    if [[ "$DRY_RUN" == "1" ]]; then
      echo "    [dry-run] would enable auto-merge on #$n"
    else
      gh_retry pr merge "$n" -R "$REPO" --auto --squash >/dev/null 2>&1 \
        && echo "    +auto-merge on #$n" \
        || echo "    !! failed to enable auto-merge on #$n"
    fi
  done

# --- CATCH-UP: labeled but no auto-merge ---
# PRs that got the `merge-queue` label from an earlier drain run (before this
# auto-merge step existed) or from manual labeling need auto-merge enabled too.
echo "=== CATCH-UP (+auto-merge on labeled PRs missing it) ==="
echo "$SNAP" | jq -c '.[]
  | select(.draft|not)
  | select(.m=="MERGEABLE")
  | select(.fail|length==0)
  | select(.head|startswith("gtmq_")|not)
  | select([.L[]] | index("merge-queue"))
  | select(.ms == "CLEAN" or .ms == "UNSTABLE")' \
| while read -r pr; do
    n=$(jq -r '.n' <<<"$pr")
    t=$(jq -r '.t' <<<"$pr")
    if [[ "$DRY_RUN" == "1" ]]; then
      echo "    [dry-run] would check auto-merge on #$n $t"
    else
      if gh pr view "$n" -R "$REPO" --json autoMergeRequest --jq '.autoMergeRequest' 2>/dev/null | grep -q 'mergeMethod'; then
        echo "  #$n  $t  auto-merge already enabled"
      else
        echo "  #$n  $t  enabling auto-merge (catch-up)"
        gh_retry pr merge "$n" -R "$REPO" --auto --squash >/dev/null 2>&1 \
          && echo "    +auto-merge on #$n" \
          || echo "    !! failed to enable auto-merge on #$n"
      fi
    fi
  done

# --- CONFLICT: needs rebase (agent branches only) → label + hand to fix agent ---
echo "=== CONFLICT (needs rebase → fix agent) ==="
echo "$SNAP" | jq -r --arg re "$AGENT_RE" '.[]
  | select(.m=="CONFLICTING")
  | select((.head|startswith("gtmq_"))|not)
  | select(.head|test($re))
  | select([.L[]] | any(.=="needs-human" or .=="hold" or .=="gated") | not)
  | "  #\(.n)  \(.t)  [\(.head)]"'
echo "$SNAP" | jq -r --arg re "$AGENT_RE" '.[]
  | select(.m=="CONFLICTING")
  | select((.head|startswith("gtmq_"))|not)
  | select(.head|test($re))
  | select([.L[]] | any(.=="needs-human" or .=="hold" or .=="gated") | not) | .n' \
| while read -r n; do [[ -n "$n" ]] && label "$n" needs-conflict-resolution; done

# --- BLOCKED: mergeable but red checks → hand to fix agent ---
echo "=== BLOCKED (red checks → fix agent) ==="
echo "$SNAP" | jq -r '.[]
  | select(.draft|not) | select(.m=="MERGEABLE") | select(.fail|length>0)
  | select([.L[]] | any(.=="needs-human" or .=="hold" or .=="gated") | not)
  | "  #\(.n)  \(.t)  ✗ \(.fail|join(", "))"'

# --- SURFACE: human-gated / superseded → report only, never auto-close ---
echo "=== SURFACE (human decision; not touched) ==="
echo "$SNAP" | jq -r '.[]
  | select([.L[]] | any(.=="needs-human" or .=="hold" or .=="gated"))
  | "  #\(.n)  \(.t)  {\(.L|join(","))}"'

# --- Graphite MQ working drafts (the queue itself; leave alone) ---
echo "=== GRAPHITE MQ in-flight (leave) ==="
echo "$SNAP" | jq -r '.[] | select(.head|startswith("gtmq_")) | "  #\(.n)  \(.t)"'

echo "=== done (DRY_RUN=$DRY_RUN) ==="
