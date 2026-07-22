#!/usr/bin/env bash
# Backend-routed PR queue drain. Graphite uses the merge-queue label as its
# transport; GitHub native uses exact-head enrollment and authoritative queue
# state while retaining the label only as intent/audit evidence.
# Autonomous shipping (2026-07-06): taste gates are advisory — only hold/gated/needs-human block.
#
# It deliberately does NOT:
#   - directly merge a PR (native enrollment uses `gh pr merge --auto`; the
#     queue still owns integration validation and the eventual merge)
#   - retarget to integration/loop-* (agents ship straight to main now)
#   - close ordinary PRs (surfaced for a human instead — see the SURFACE bucket)
#
# Graphite synthetic drafts are different: their generated `gtmq_*` branch can
# still land after a source PR's queue authorization is withdrawn. The
# synthetic-source guard below closes those generated drafts unless every open
# source remains explicitly `merge-queue` enrolled and free of hard gates.
#
# Buckets that need code work (CONFLICT / BLOCKED) are printed for the
# /drain command to fan out per-PR worktree agents (cheap model for mechanical
# rebases, capable model for semantic conflicts).
#
# Env:
#   DRY_RUN=1   classify and print only; apply no labels
#   DRAIN_MUTATION_AUTHORIZATION  required for every live mutation run
#   DRAIN_EXPECT_GH  optional exact gh path assertion used by test fixtures
#   DRAIN_MAX_SECONDS  hard wall-clock budget between GitHub calls (default 900)
#   MERGE_QUEUE_BACKEND  native (default) or graphite rollback; unknown values fail closed
set -euo pipefail

DRY_RUN="${DRY_RUN:-0}"
if [[ "$DRY_RUN" != "1" ]]; then
  case "${DRAIN_MUTATION_AUTHORIZATION:-}" in
    merge-queue-autoenroll | test-fixture) ;;
    *)
      echo "::error::Refusing live drain without recognized DRAIN_MUTATION_AUTHORIZATION" >&2
      exit 2
      ;;
  esac
fi
if [[ -n "${DRAIN_EXPECT_GH:-}" ]]; then
  resolved_gh="$(command -v gh || true)"
  if [[ "$resolved_gh" != "$DRAIN_EXPECT_GH" ]]; then
    echo "::error::Refusing drain: expected gh at $DRAIN_EXPECT_GH, resolved ${resolved_gh:-missing}" >&2
    exit 2
  fi
fi

# shellcheck source=./scripts/lib/gh-retry.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/gh-retry.sh"

REPO="${REPO:-JovieInc/Jovie}"
MERGE_QUEUE_BACKEND="${MERGE_QUEUE_BACKEND:-native}"
case "$MERGE_QUEUE_BACKEND" in
  graphite | native) ;;
  *)
    echo "::error::Unknown MERGE_QUEUE_BACKEND: $MERGE_QUEUE_BACKEND" >&2
    exit 2
    ;;
esac
DRAIN_MAX_SECONDS="${DRAIN_MAX_SECONDS:-900}"
DRAIN_STARTED_AT="$SECONDS"

# Keep one scheduled tick bounded. A single in-flight GitHub call may finish
# after the deadline, but no subsequent per-PR operation is started.
stop_if_budget_exhausted() {
  if (( SECONDS - DRAIN_STARTED_AT >= DRAIN_MAX_SECONDS )); then
    echo "=== drain budget exhausted after ${DRAIN_MAX_SECONDS}s; deferring remaining PRs ==="
    return 0
  fi
  return 1
}
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

# The queue snapshot can be stale by the time enrollment begins. Re-read the
# authoritative PR state immediately before mutation so a draft conversion or
# a queue-deferred hold cannot be overwritten by this controller.
enroll_if_still_eligible() {  # enroll_if_still_eligible <num>
  local n="$1" current head_oid json_fields
  json_fields="state,isDraft,mergeable,labels"
  [[ "$MERGE_QUEUE_BACKEND" == "native" ]] && json_fields+=",headRefOid"
  if ! current="$(gh_retry pr view "$n" -R "$REPO" \
    --json "$json_fields" 2>/dev/null)"; then
    echo "    !! could not refresh #$n eligibility; refusing enrollment" >&2
    return 1
  fi
  if ! jq -e --arg backend "$MERGE_QUEUE_BACKEND" '
    .state == "OPEN"
    and (.isDraft | not)
    and .mergeable == "MERGEABLE"
    and ([.labels[].name] | any(
      . == "needs-human" or . == "hold" or . == "gated"
      or . == "queue-deferred" or . == "needs-conflict-resolution"
      or . == "fast" or ($backend == "graphite" and . == "merge-queue")
    ) | not)
  ' <<<"$current" >/dev/null; then
    echo "    ⏸ eligibility changed; refusing enrollment for #$n"
    return 2
  fi
  if [[ "$DRY_RUN" == "1" ]]; then
    if [[ "$MERGE_QUEUE_BACKEND" == "graphite" ]]; then
      echo "    [dry-run] would +merge-queue on #$n"
    else
      echo "    [dry-run] would enroll #$n via native"
    fi
    return 0
  fi
  if [[ "$MERGE_QUEUE_BACKEND" == "native" ]]; then
    head_oid="$(jq -r '.headRefOid // empty' <<<"$current")"
    if [[ ! "$head_oid" =~ ^[0-9a-fA-F]{40}$ ]]; then
      echo "    !! missing exact head SHA for native enrollment of #$n" >&2
      return 1
    fi
    expected_head="$(printf '%s' "$head_oid" | tr '[:upper:]' '[:lower:]')"
    if ! node scripts/merge-queue-backend.mjs enroll "$n" "$head_oid" >/dev/null; then
      echo "    !! native enrollment/postcondition failed for #$n" >&2
      return 1
    fi

    # Labels do not change the head SHA, so expected-head protection alone
    # cannot close the hard-gate race. Re-read after native enrollment and
    # compensate immediately if a gated/held label appeared while the queue
    # mutation was in flight.
    if ! current="$(gh_retry pr view "$n" -R "$REPO" \
      --json state,isDraft,mergeable,labels,headRefOid 2>/dev/null)"; then
      echo "    !! could not refresh #$n after native enrollment; compensating" >&2
      if ! remove_held_queue_label_strict "$n"; then
        echo "    !! CRITICAL: could not compensate uncertain native enrollment for #$n" >&2
        return 1
      fi
      return 2
    fi
    if ! jq -e --arg expected_head "$expected_head" '
      .state == "OPEN"
      and (.isDraft | not)
      and .mergeable == "MERGEABLE"
      and ((.headRefOid // "") | ascii_downcase) == $expected_head
      and ([.labels[].name] | any(
        . == "needs-human" or . == "hold" or . == "gated"
        or . == "queue-deferred" or . == "needs-conflict-resolution"
        or . == "fast"
      ) | not)
    ' <<<"$current" >/dev/null; then
      echo "    ⏸ eligibility changed during native enrollment for #$n; compensating"
      if ! remove_held_queue_label_strict "$n"; then
        echo "    !! CRITICAL: could not compensate held native enrollment for #$n" >&2
        return 1
      fi
      return 2
    fi

    # Audit label is best-effort evidence only: external watchers (e.g.
    # Graphite's account-less unlabel hook) can strip it within seconds, and a
    # missing audit label must never unwind a proven native enrollment
    # (GH-14694: drain repeatedly dequeued freshly-enrolled PRs when the label
    # vanished between the write and the final proof).
    if ! gh_retry pr edit "$n" -R "$REPO" --add-label merge-queue >/dev/null; then
      echo "    note: could not record native intent label for #$n (non-fatal)"
    fi

    # Final proof re-verifies eligibility and native queue membership — never
    # the audit label, which external watchers may legitimately strip. The
    # labeled event remains a later safety net; this controller does not rely
    # on that event to repair its own mutation.
    if ! current="$(gh_retry pr view "$n" -R "$REPO" \
      --json state,isDraft,mergeable,labels,headRefOid 2>/dev/null)" \
      || ! jq -e --arg expected_head "$expected_head" '
        .state == "OPEN"
        and (.isDraft | not)
        and .mergeable == "MERGEABLE"
        and ((.headRefOid // "") | ascii_downcase) == $expected_head
        and ([.labels[].name] | any(
          . == "needs-human" or . == "hold" or . == "gated"
          or . == "queue-deferred" or . == "needs-conflict-resolution"
          or . == "fast"
        ) | not)
      ' <<<"$current" >/dev/null; then
      echo "    ⏸ eligibility changed while recording native enrollment for #$n; compensating"
      if ! remove_held_queue_label_strict "$n"; then
        echo "    !! CRITICAL: could not compensate final native eligibility failure for #$n" >&2
        return 1
      fi
      return 2
    fi
    echo "    +native-queue on #$n at $head_oid"
    return 0
  fi
  if ! gh_retry pr edit "$n" -R "$REPO" --add-label merge-queue >/dev/null; then
    echo "    !! failed to add merge-queue on #$n" >&2
    return 1
  fi
  if ! current="$(gh_retry pr view "$n" -R "$REPO" \
    --json state,isDraft,mergeable,labels 2>/dev/null)"; then
    echo "    !! could not verify #$n after enrollment" >&2
    if ! remove_held_queue_label_strict "$n"; then
      echo "    !! CRITICAL: could not prove failed enrollment was compensated for #$n" >&2
    fi
    return 1
  fi
  if jq -e '
    .state == "OPEN"
    and (.isDraft | not)
    and .mergeable == "MERGEABLE"
    and ([.labels[].name] | index("merge-queue"))
    and ([.labels[].name] | any(
      . == "needs-human" or . == "hold" or . == "gated"
      or . == "queue-deferred" or . == "needs-conflict-resolution"
      or . == "fast"
    ) | not)
  ' <<<"$current" >/dev/null; then
    echo "    +merge-queue on #$n"
    return 0
  fi
  echo "    !! enrollment verification failed for #$n" >&2
  if ! remove_held_queue_label_strict "$n"; then
    echo "    !! CRITICAL: could not prove failed enrollment was compensated for #$n" >&2
  fi
  return 1
}

remove_held_queue_label_strict() {  # remove_held_queue_label_strict <num>
  local n="$1" current
  if [[ "$DRY_RUN" == "1" ]]; then
    if [[ "$MERGE_QUEUE_BACKEND" == "native" ]]; then
      echo "    [dry-run] would dequeue #$n from native"
    else
      echo "    [dry-run] would -merge-queue on #$n"
    fi
    return 0
  fi
  if [[ "$MERGE_QUEUE_BACKEND" == "native" ]]; then
    if ! node scripts/merge-queue-backend.mjs dequeue "$n" >/dev/null; then
      echo "    !! failed to prove native dequeue for held PR #$n" >&2
      return 1
    fi
    if ! current="$(gh_retry pr view "$n" -R "$REPO" --json labels 2>/dev/null)"; then
      echo "    !! could not read intent label after native dequeue for #$n" >&2
      return 1
    fi
    if jq -e '([.labels[].name] | index("merge-queue")) != null' <<<"$current" >/dev/null; then
      if ! gh_retry pr edit "$n" -R "$REPO" --remove-label merge-queue >/dev/null; then
        echo "    !! failed to remove native intent label from #$n" >&2
        return 1
      fi
    fi
    echo "    -native-queue on #$n"
    return 0
  fi
  if ! gh_retry pr edit "$n" -R "$REPO" --remove-label merge-queue >/dev/null; then
    echo "    !! failed to remove merge-queue hold violation from #$n" >&2
    return 1
  fi
  if ! current="$(gh_retry pr view "$n" -R "$REPO" --json labels 2>/dev/null)"; then
    echo "    !! could not verify merge-queue removal for held PR #$n" >&2
    return 1
  fi
  if jq -e '([.labels[].name] | index("merge-queue")) == null' \
    <<<"$current" >/dev/null; then
    echo "    -merge-queue on #$n"
    return 0
  fi
  echo "    !! held PR #$n still has merge-queue after removal" >&2
  return 1
}

check_failures_for_pr() {  # check_failures_for_pr <num>
  local n="$1"
  local attempts="${GH_RETRY_ATTEMPTS:-5}"
  local base_delay="${GH_RETRY_BASE_DELAY:-2}"
  local max_delay="${GH_RETRY_MAX_DELAY:-30}"
  local attempt=1
  local raw_file out_file err_file err delay
  raw_file="$(mktemp)"
  out_file="$(mktemp)"
  err_file="$(mktemp)"

  # Positive readiness proof: all required aggregate contexts must exist and
  # succeed, and any present canonical merge-gate leaf must be complete. A
  # pending gate is not a failure, but it is not permission to enqueue either.
  while [[ "$attempt" -le "$attempts" ]]; do
    : >"$raw_file"
    : >"$out_file"
    : >"$err_file"
    if gh pr checks "$n" -R "$REPO" --json name,bucket,state,workflow,description,startedAt,completedAt >"$raw_file" 2>"$err_file"; then
      if jq -e 'type == "array"' "$raw_file" >/dev/null 2>&1 \
        && node "$(dirname "${BASH_SOURCE[0]}")/lib/pr-check-failures.mjs" \
          --classify-queue <"$raw_file" >"$out_file"; then
        cat "$out_file"
        rm -f "$raw_file" "$out_file" "$err_file"
        return 0
      fi
    elif jq -e 'type == "array"' "$raw_file" >/dev/null 2>&1 \
      && node "$(dirname "${BASH_SOURCE[0]}")/lib/pr-check-failures.mjs" \
        --classify-queue <"$raw_file" >"$out_file"; then
      # `gh pr checks` exits 8 when checks are pending, even with valid JSON.
      cat "$out_file"
      rm -f "$raw_file" "$out_file" "$err_file"
      return 0
    fi

    err="$(<"$err_file")"
    if [[ "$attempt" -eq "$attempts" ]] || ! gh_retry_is_transient_error "$err"; then
      [[ -n "$err" ]] && echo "  !! could not read required checks for #$n: $err" >&2
      jq -cn --arg reason "required check status unavailable" '[$reason]'
      rm -f "$raw_file" "$out_file" "$err_file"
      return 0
    fi

    delay=$((base_delay * (2 ** (attempt - 1))))
    [[ "$delay" -gt "$max_delay" ]] && delay="$max_delay"
    echo "  [gh-retry] pr checks #$n attempt $attempt/$attempts failed (transient); retrying in ${delay}s…" >&2
    sleep "$delay"
    attempt=$((attempt + 1))
  done

  rm -f "$raw_file" "$out_file" "$err_file"
  jq -cn --arg reason "required check status unavailable" '[$reason]'
}

SNAP="$(gh_retry pr list -R "$REPO" --state open --limit 200 \
  --json number,title,body,isDraft,mergeable,mergeStateStatus,labels,headRefName --jq '
  [ .[] | {
    n: .number,
    t: (.title[0:48]),
    draft: .isDraft,
    m: .mergeable,
    ms: (.mergeStateStatus // "UNKNOWN"),
    head: .headRefName,
    body: (.body // ""),
    L: [.labels[].name],
    fail: []
  } ]')"

# Resolve authoritative queue membership once for the snapshot. In native
# mode labels are only intent/audit evidence and must never be treated as queue
# state. Fail closed if GitHub omits any open PR from the GraphQL snapshot.
if [[ "$MERGE_QUEUE_BACKEND" == "native" ]]; then
  if [[ "$DRY_RUN" != "1" ]]; then
    node scripts/merge-queue-backend.mjs preflight >/dev/null
  fi
  NATIVE_QUEUE_STATE="$(node scripts/merge-queue-backend.mjs list-state)"
  if ! jq -e --argjson states "$NATIVE_QUEUE_STATE" '
    all(.[]; ($states[(.n | tostring)] | type) == "object")
  ' <<<"$SNAP" >/dev/null; then
    echo "::error::Native queue state omitted an open PR; refusing partial drain" >&2
    exit 1
  fi
  SNAP="$(jq -c --argjson states "$NATIVE_QUEUE_STATE" '
    map(. + {
      q: ($states[(.n | tostring)].queued == true),
      oid: $states[(.n | tostring)].headRefOid
    })
  ' <<<"$SNAP")"
else
  SNAP="$(jq -c '
    map(. + {q: (((.L // []) | index("merge-queue")) != null)})
  ' <<<"$SNAP")"

  # A source can be dequeued or gated after Graphite has already materialized
  # a speculative gtmq branch. Removing the source label alone does not
  # reliably cancel that generated branch, so fail closed before other work.
  echo "=== GRAPHITE MQ source authorization ==="
  printf '%s\n' "$SNAP" | GTMQ_MUTATION_AUTHORIZATION=drain-snapshot \
    bash "$(dirname "${BASH_SOURCE[0]}")/guard-gtmq-source-authorization.sh" --snapshot
fi

ENRICHED="[]"
while IFS= read -r pr; do
  stop_if_budget_exhausted && break
  n="$(jq -r '.n' <<<"$pr")"
  fail="[]"
  if jq -e '
    (.draft | not)
    and (.m == "MERGEABLE")
    and ((.head | startswith("gtmq_")) | not)
    and (([.L[]] | any(. == "needs-human" or . == "hold" or . == "gated" or . == "queue-deferred" or . == "fast")) | not)
  ' <<<"$pr" >/dev/null; then
    fail="$(check_failures_for_pr "$n")"
  fi
  # Guard: check_failures_for_pr might return non-JSON under transient gh errors.
  # Unknown check state is a blocker, never permission to enqueue.
  if ! jq -e . <<<"$fail" >/dev/null 2>&1; then
    fail='["required check status unavailable"]'
  fi
  ENRICHED="$(jq -c --argjson pr "$pr" --argjson fail "$fail" '. + [$pr + {fail: $fail}]' <<<"$ENRICHED")"
done < <(jq -c '.[]' <<<"$SNAP")
SNAP="$ENRICHED"

# --- SUMMARY: make queue shape obvious in scheduled logs ---
echo "=== QUEUE SUMMARY ==="
echo "$SNAP" | jq -r '
  def labels: (.L // []);
  def queued: .q == true;
  def hard_gated: labels | any(. == "needs-human" or . == "hold" or . == "gated" or . == "queue-deferred");
  [
    "  CLEAN: " + ([.[] | select(queued and (.ms // "") == "CLEAN")] | length | tostring),
    "  UNSTABLE: " + ([.[] | select(queued and (.ms // "") == "UNSTABLE")] | length | tostring),
    "  BLOCKED: " + ([.[] | select(queued and (.ms // "") == "BLOCKED")] | length | tostring),
    "  DIRTY: " + ([.[] | select(queued and (.ms // "") == "DIRTY")] | length | tostring),
    "  hard-gated: " + ([.[] | select(hard_gated)] | length | tostring),
    "  gtmq: " + ([.[] | select((.head // "") | startswith("gtmq_"))] | length | tostring)
  ] | .[]'

# --- DEQUEUE: hard-gated PRs must not occupy queue slots ---
echo "=== DEQUEUE (hard gates → -merge-queue) ==="
while read -r pr; do
    n=$(jq -r '.n' <<<"$pr"); t=$(jq -r '.t' <<<"$pr")
    echo "  #$n  $t"
    if ! remove_held_queue_label_strict "$n"; then
      echo "::error::Failed to prove held PR #$n is outside merge queue" >&2
      exit 1
    fi
  done < <(echo "$SNAP" | jq -c '.[]
  | select(.q == true)
  | select((.head|startswith("gtmq_"))|not)
  | select(.draft or ([.L[]] | any(. == "needs-human" or . == "hold" or . == "gated" or . == "queue-deferred")))')

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
  | select(.q == true)
  | select((.head|startswith("gtmq_"))|not)
  | select(([.L[]] | any(.=="needs-human" or .=="hold" or .=="gated" or .=="queue-deferred")) | not)
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
    if [[ "$MERGE_QUEUE_BACKEND" == "native" ]]; then
      if ! remove_held_queue_label_strict "$n"; then
        echo "::error::Failed to prove PR #$n is outside native merge queue" >&2
        exit 1
      fi
    else
      unlabel "$n" merge-queue
    fi
  done

# --- ENROLL: non-draft, mergeable, no FAILING checks, not opted-out, not queued ---
# Enroll on mergeable + no actually-failing checks. We deliberately do NOT require
# mergeStateStatus==CLEAN: zombie cancelled/queued required-check runs (from
# cancel-in-progress) pin otherwise-green PRs at BLOCKED, and gating enrollment on
# CLEAN meant those PRs never entered the queue. Enrolling a not-yet-green PR is
# safe — Graphite re-validates and the dequeue step above removes any that truly
# fail. `.fail` only counts terminal failing checks, not pending/queued ones.
echo "=== ENROLL (mergeable + not failing → +merge-queue) ==="
# Honor the checked-in queue policy's maxQueueDepth. Use process substitution rather
# than a pipe so ENROLLED_THIS_RUN remains in the parent shell and the cap is
# actually enforced.
MAX_QUEUE_DEPTH=$(node scripts/ci-merge-queue-check.mjs max-queue-depth 2>/dev/null || echo 16)
QUEUED_NOW=$(echo "$SNAP" | jq '[.[] | select(.q == true)] | length')
ENROLL_SLOTS=$((MAX_QUEUE_DEPTH - QUEUED_NOW))
[[ "$ENROLL_SLOTS" -lt 0 ]] && ENROLL_SLOTS=0
echo "  queue depth: $QUEUED_NOW/$MAX_QUEUE_DEPTH ($ENROLL_SLOTS slots)"
ENROLLED_THIS_RUN=0
while read -r pr; do
  stop_if_budget_exhausted && break
  n=$(jq -r '.n' <<<"$pr"); t=$(jq -r '.t' <<<"$pr")
  if [[ "$ENROLLED_THIS_RUN" -ge "$ENROLL_SLOTS" ]]; then
    echo "  #$n  $t  ⏸ deferred (queue at depth cap; next drain pass enrolls)"
    continue
  fi
  ENROLLED_THIS_RUN=$((ENROLLED_THIS_RUN + 1))
  echo "  #$n  $t"
  if enroll_if_still_eligible "$n"; then
    :
  else
    enroll_result=$?
    ENROLLED_THIS_RUN=$((ENROLLED_THIS_RUN - 1))
    if [[ "$enroll_result" -eq 2 ]]; then
      continue
    fi
    echo "::error::Failed to prove enrollment for #$n" >&2
    exit 1
  fi
done < <(echo "$SNAP" | jq -c '.[]
  | select(.draft|not)
  | select(.m=="MERGEABLE")
  | select(.fail|length==0)
  | select((.head|startswith("gtmq_"))|not)
  | select(.q | not)
  | select([.L[]] | any(.=="needs-human" or .=="hold" or .=="gated" or .=="queue-deferred" or .=="needs-conflict-resolution" or .=="fast") | not)')

# --- CONFLICT: needs rebase (agent branches only) → label + hand to fix agent ---
echo "=== CONFLICT (needs rebase → fix agent) ==="
echo "$SNAP" | jq -r --arg re "$AGENT_RE" '.[]
  | select(.m=="CONFLICTING")
  | select((.head|startswith("gtmq_"))|not)
  | select(.head|test($re))
  | select([.L[]] | any(.=="needs-human" or .=="hold" or .=="gated" or .=="queue-deferred") | not)
  | "  #\(.n)  \(.t)  [\(.head)]"'
echo "$SNAP" | jq -r --arg re "$AGENT_RE" '.[]
  | select(.m=="CONFLICTING")
  | select((.head|startswith("gtmq_"))|not)
  | select(.head|test($re))
  | select([.L[]] | any(.=="needs-human" or .=="hold" or .=="gated" or .=="queue-deferred") | not) | .n' \
| while read -r n; do [[ -n "$n" ]] && label "$n" needs-conflict-resolution; done

# --- BLOCKED: mergeable but red checks → hand to fix agent ---
echo "=== BLOCKED (red checks → fix agent) ==="
echo "$SNAP" | jq -r '.[]
  | select(.draft|not) | select(.m=="MERGEABLE") | select(.fail|length>0)
  | select([.L[]] | any(.=="needs-human" or .=="hold" or .=="gated" or .=="queue-deferred") | not)
  | "  #\(.n)  \(.t)  ✗ \(.fail|join(", "))"'

# --- SURFACE: human-gated / superseded → report only, never auto-close ---
echo "=== SURFACE (human decision; not touched) ==="
echo "$SNAP" | jq -r '.[]
  | select(.draft or ([.L[]] | any(.=="needs-human" or .=="hold" or .=="gated" or .=="queue-deferred")))
  | "  #\(.n)  \(.t)  {\(.L|join(","))}"'

echo "=== done (DRY_RUN=$DRY_RUN) ==="
