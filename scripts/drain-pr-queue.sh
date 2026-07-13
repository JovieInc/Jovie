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
#   DRAIN_MAX_SECONDS  hard wall-clock budget between GitHub calls (default 900)
set -euo pipefail

# shellcheck source=./scripts/lib/gh-retry.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/gh-retry.sh"

REPO="${REPO:-JovieInc/Jovie}"
DRY_RUN="${DRY_RUN:-0}"
DRAIN_MAX_SECONDS="${DRAIN_MAX_SECONDS:-900}"
DRAIN_STARTED_AT="$SECONDS"
CI_EVIDENCE_CACHE_DIR="$(mktemp -d)"
trap 'rm -rf "$CI_EVIDENCE_CACHE_DIR"' EXIT

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

# The queue snapshot can be stale by the time enrollment begins. Re-read the
# authoritative PR state immediately before mutation so a draft conversion or
# a queue-deferred hold cannot be overwritten by this controller.
enroll_if_still_eligible() {  # enroll_if_still_eligible <num> <expected-head-sha>
  local n="$1" expected_sha="$2" current
  if ! current="$(gh_retry pr view "$n" -R "$REPO" \
    --json state,isDraft,mergeable,labels,headRefOid 2>/dev/null)"; then
    echo "    !! could not refresh #$n eligibility; refusing enrollment" >&2
    return 1
  fi
  if ! jq -e --arg expected "$expected_sha" '
    .state == "OPEN"
    and ($expected == "" or .headRefOid == $expected)
    and (.isDraft | not)
    and .mergeable == "MERGEABLE"
    and ([.labels[].name] | any(
      . == "needs-human" or . == "hold" or . == "gated"
      or . == "queue-deferred" or . == "needs-conflict-resolution"
      or . == "merge-queue" or . == "fast"
    ) | not)
  ' <<<"$current" >/dev/null; then
    echo "    ⏸ eligibility changed; refusing enrollment for #$n"
    return 2
  fi
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "    [dry-run] would +merge-queue on #$n"
    return 0
  fi
  if ! gh_retry pr edit "$n" -R "$REPO" --add-label merge-queue >/dev/null; then
    echo "    !! failed to add merge-queue on #$n" >&2
    return 1
  fi
  if ! current="$(gh_retry pr view "$n" -R "$REPO" \
    --json state,isDraft,mergeable,labels,headRefOid 2>/dev/null)"; then
    echo "    !! could not verify #$n after enrollment" >&2
    if ! remove_queue_label_strict "$n"; then
      echo "    !! CRITICAL: could not prove failed enrollment was compensated for #$n" >&2
    fi
    return 1
  fi
  if jq -e --arg expected "$expected_sha" '
    .state == "OPEN"
    and ($expected == "" or .headRefOid == $expected)
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
  if ! remove_queue_label_strict "$n"; then
    echo "    !! CRITICAL: could not prove failed enrollment was compensated for #$n" >&2
  fi
  return 1
}

remove_queue_label_strict() {  # remove_queue_label_strict <num>
  local n="$1" current mutation_failed=0
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "    [dry-run] would -merge-queue on #$n"
    return 0
  fi
  if ! gh_retry pr edit "$n" -R "$REPO" --remove-label merge-queue >/dev/null; then
    mutation_failed=1
    echo "    !! remove-label request failed for #$n; verifying authoritative state" >&2
  fi
  if ! current="$(gh_retry pr view "$n" -R "$REPO" --json labels 2>/dev/null)"; then
    echo "    !! could not verify merge-queue removal for #$n" >&2
    return 1
  fi
  if jq -e '([.labels[].name] | index("merge-queue")) == null' \
    <<<"$current" >/dev/null; then
    if [[ "$mutation_failed" -eq 1 ]]; then
      echo "    merge-queue already absent on #$n"
    else
      echo "    -merge-queue on #$n"
    fi
    return 0
  fi
  echo "    !! PR #$n still has merge-queue after removal" >&2
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

ci_harness_blockers_for_pr() {  # ci_harness_blockers_for_pr <num> <head-sha>
  local n="$1" sha="$2" cache_file artifact_file decision
  local checks_file run_file artifacts_file zip_file run_url run_id run_attempt artifact_id
  cache_file="$CI_EVIDENCE_CACHE_DIR/${sha}.json"
  if [[ -f "$cache_file" ]]; then
    cat "$cache_file"
    return 0
  fi
  artifact_file="$CI_EVIDENCE_CACHE_DIR/${sha}.ci-harness.v1.json"

  # Deterministic fixture seam for shell integration tests. Production never
  # sets this variable and always reads the exact-head Actions artifact.
  if [[ "${DRAIN_CI_HARNESS_TEST_MODE:-0}" == "1" \
    && -n "${DRAIN_CI_HARNESS_ARTIFACT_FILE:-}" ]]; then
    cp "$DRAIN_CI_HARNESS_ARTIFACT_FILE" "$artifact_file"
  else
    checks_file="$CI_EVIDENCE_CACHE_DIR/${sha}.checks.json"
    run_file="$CI_EVIDENCE_CACHE_DIR/${sha}.run.json"
    artifacts_file="$CI_EVIDENCE_CACHE_DIR/${sha}.artifacts.json"
    zip_file="$CI_EVIDENCE_CACHE_DIR/${sha}.zip"

    if ! gh pr checks "$n" -R "$REPO" \
      --json name,state,link,completedAt >"$checks_file" 2>/dev/null; then
      # Exit 8 is valid JSON with pending checks; the required-check classifier
      # already blocks those. Any unreadable response here remains fail-closed.
      if ! jq -e 'type == "array"' "$checks_file" >/dev/null 2>&1; then
        jq -cn '["CI harness check-run lookup unavailable"]' >"$cache_file"
        cat "$cache_file"
        return 0
      fi
    fi
    run_url="$(jq -r '
      [.[] | select(.name == "PR Ready" and .state == "SUCCESS")]
      | sort_by(.completedAt // "") | last | .link // empty
    ' "$checks_file")"
    run_id="$(sed -nE 's#.*actions/runs/([0-9]+).*#\1#p' <<<"$run_url")"
    if [[ -z "$run_id" ]]; then
      jq -cn '["exact-head PR Ready workflow run is unavailable"]' >"$cache_file"
      cat "$cache_file"
      return 0
    fi
    if ! gh_retry api "repos/$REPO/actions/runs/$run_id" >"$run_file" 2>/dev/null; then
      jq -cn '["CI harness workflow metadata unavailable"]' >"$cache_file"
      cat "$cache_file"
      return 0
    fi
    if ! jq -e --arg sha "$sha" '.head_sha == $sha' "$run_file" >/dev/null; then
      jq -cn '["CI harness workflow does not match the exact PR head"]' >"$cache_file"
      cat "$cache_file"
      return 0
    fi
    run_attempt="$(jq -r '.run_attempt // empty' "$run_file")"
    if [[ -z "$run_attempt" ]] || ! gh_retry api \
      "repos/$REPO/actions/runs/$run_id/artifacts?per_page=100" \
      >"$artifacts_file" 2>/dev/null; then
      jq -cn '["CI harness artifact listing unavailable"]' >"$cache_file"
      cat "$cache_file"
      return 0
    fi
    artifact_id="$(jq -r --arg name "ci-harness-${run_id}-${run_attempt}" '
      [.artifacts[] | select(.name == $name and (.expired | not))]
      | if length == 1 then .[0].id else empty end
    ' "$artifacts_file")"
    if [[ -z "$artifact_id" ]] || ! gh_retry api \
      "repos/$REPO/actions/artifacts/$artifact_id/zip" >"$zip_file" 2>/dev/null \
      || ! unzip -p "$zip_file" ci-harness.v1.json >"$artifact_file" 2>/dev/null; then
      jq -cn '["exact-head CI harness artifact is missing, expired, or unreadable"]' >"$cache_file"
      cat "$cache_file"
      return 0
    fi
  fi

  if decision="$(node scripts/ci-harness.mjs verify-enrollment \
    --artifact "$artifact_file" --head-sha "$sha" 2>/dev/null)" \
    && jq -e '.ok == true' <<<"$decision" >/dev/null; then
    echo '[]' >"$cache_file"
  elif jq -e '.blockers | type == "array"' <<<"$decision" >/dev/null 2>&1; then
    jq -c '.blockers' <<<"$decision" >"$cache_file"
  else
    jq -cn '["CI harness artifact verification failed closed"]' >"$cache_file"
  fi
  cat "$cache_file"
}

SNAP="$(gh_retry pr list -R "$REPO" --state open --limit 200 \
  --json number,title,isDraft,mergeable,mergeStateStatus,labels,headRefName,headRefOid --jq '
  [ .[] | {
    n: .number,
    t: (.title[0:48]),
    draft: .isDraft,
    m: .mergeable,
    ms: (.mergeStateStatus // "UNKNOWN"),
    head: .headRefName,
    sha: .headRefOid,
    L: [.labels[].name],
    fail: []
  } ]')"

ENRICHED="[]"
while IFS= read -r pr; do
  stop_if_budget_exhausted && break
  n="$(jq -r '.n' <<<"$pr")"
  sha="$(jq -r --arg fallback "${DRAIN_CI_HARNESS_TEST_HEAD_SHA:-}" '.sha // $fallback' <<<"$pr")"
  fail="[]"
  if jq -e '
    (.draft | not)
    and (.m == "MERGEABLE")
    and ((.head | startswith("gtmq_")) | not)
    and (([.L[]] | any(. == "needs-human" or . == "hold" or . == "gated" or . == "queue-deferred" or . == "fast")) | not)
  ' <<<"$pr" >/dev/null; then
    fail="$(check_failures_for_pr "$n")"
    if jq -e 'length == 0' <<<"$fail" >/dev/null 2>&1; then
      if [[ -z "$sha" ]]; then
        fail='["exact PR head SHA unavailable"]'
      else
        evidence_fail="$(ci_harness_blockers_for_pr "$n" "$sha")"
        fail="$(jq -cn --argjson checks "$fail" --argjson evidence "$evidence_fail" '$checks + $evidence')"
      fi
    fi
  fi
  # Classification output is permission-bearing. Malformed output must block;
  # treating it as an empty failure set would silently authorize enrollment.
  if ! jq -e 'type == "array"' <<<"$fail" >/dev/null 2>&1; then
    fail='["required check/evidence classification unavailable"]'
  fi
  ENRICHED="$(jq -c --argjson pr "$pr" --argjson fail "$fail" '. + [$pr + {fail: $fail}]' <<<"$ENRICHED")"
done < <(jq -c '.[]' <<<"$SNAP")
SNAP="$ENRICHED"

# --- SUMMARY: make queue shape obvious in scheduled logs ---
echo "=== QUEUE SUMMARY ==="
echo "$SNAP" | jq -r '
  def labels: (.L // []);
  def queued: labels | index("merge-queue");
  def hard_gated: labels | any(. == "needs-human" or . == "hold" or . == "gated" or . == "queue-deferred");
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
while read -r pr; do
    n=$(jq -r '.n' <<<"$pr"); t=$(jq -r '.t' <<<"$pr")
    echo "  #$n  $t"
    if ! remove_queue_label_strict "$n"; then
      echo "::error::Failed to prove held PR #$n is outside merge queue" >&2
      exit 1
    fi
  done < <(echo "$SNAP" | jq -c '.[]
  | select([.L[]] | index("merge-queue"))
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
  | select([.L[]] | index("merge-queue"))
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
    if ! remove_queue_label_strict "$n"; then
      echo "::error::Failed to prove blocked PR #$n is outside merge queue" >&2
      exit 1
    fi
  done

# --- ENROLL: exact-head required checks + harness evidence green, mergeable, not held/queued ---
# Enrollment requires positive proof from the exact PR head: every required
# aggregate succeeds, present merge-gate leaves are complete, and the matching
# CI harness artifact satisfies any risk-derived smoke/preview requirements.
# We deliberately do not require mergeStateStatus==CLEAN because GitHub can pin
# it BLOCKED on superseded cancelled/queued attempts; `.fail` already contains
# required-check, merge-gate, artifact, and evidence blockers.
echo "=== ENROLL (mergeable + exact-head evidence green → +merge-queue) ==="
# Honor GRAPHITE_QUEUE_POLICY.maxQueueDepth. Use process substitution rather
# than a pipe so ENROLLED_THIS_RUN remains in the parent shell and the cap is
# actually enforced.
MAX_QUEUE_DEPTH=$(node scripts/ci-merge-queue-check.mjs max-queue-depth 2>/dev/null || echo 16)
QUEUED_NOW=$(echo "$SNAP" | jq '[.[] | select([.L[]] | index("merge-queue"))] | length')
ENROLL_SLOTS=$((MAX_QUEUE_DEPTH - QUEUED_NOW))
[[ "$ENROLL_SLOTS" -lt 0 ]] && ENROLL_SLOTS=0
echo "  queue depth: $QUEUED_NOW/$MAX_QUEUE_DEPTH ($ENROLL_SLOTS slots)"
ENROLLED_THIS_RUN=0
while read -r pr; do
  stop_if_budget_exhausted && break
  n=$(jq -r '.n' <<<"$pr"); t=$(jq -r '.t' <<<"$pr")
  sha=$(jq -r --arg fallback "${DRAIN_CI_HARNESS_TEST_HEAD_SHA:-}" '.sha // $fallback' <<<"$pr")
  if [[ "$ENROLLED_THIS_RUN" -ge "$ENROLL_SLOTS" ]]; then
    echo "  #$n  $t  ⏸ deferred (queue at depth cap; next drain pass enrolls)"
    continue
  fi
  ENROLLED_THIS_RUN=$((ENROLLED_THIS_RUN + 1))
  echo "  #$n  $t"
  mutation_sha="$sha"
  [[ "${DRAIN_CI_HARNESS_TEST_MODE:-0}" == "1" ]] && mutation_sha=""
  if enroll_if_still_eligible "$n" "$mutation_sha"; then
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
  | select([.L[]] | any(.=="needs-human" or .=="hold" or .=="gated" or .=="queue-deferred" or .=="needs-conflict-resolution" or .=="merge-queue" or .=="fast") | not)')

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

# --- Graphite MQ working drafts (the queue itself; leave alone) ---
echo "=== GRAPHITE MQ in-flight (leave) ==="
echo "$SNAP" | jq -r '.[] | select(.head|startswith("gtmq_")) | "  #\(.n)  \(.t)"'

echo "=== done (DRY_RUN=$DRY_RUN) ==="
