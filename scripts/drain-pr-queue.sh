#!/usr/bin/env bash
# GitHub-native PR queue drain. Native enrollment uses exact-head admission and
# authoritative queue state without reading, writing, or requiring a transport
# label. A label-backed fixture exists only for isolated shell tests.
# Autonomous shipping (2026-07-06): taste gates are advisory — only hold/gated/needs-human block.
#
# It deliberately does NOT:
#   - directly merge a PR (native enrollment uses `gh pr merge --auto`; the
#     queue still owns integration validation and the eventual merge)
#   - retarget to integration/loop-* (agents ship straight to main now)
#   - close ordinary PRs (surfaced for a human instead — see the SURFACE bucket)
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
#   DRAIN_ISOLATION_EVAL_TIMEOUT_SECONDS  hard cap per exact-head isolation
#     evaluator process (default 45)
#   DRAIN_ADMISSION_PR / DRAIN_ADMISSION_HEAD  optional exact new-admission
#     scope; when both are empty this run is maintenance-only
#   DRAIN_PROMOTION_MODE  normal, isolated-only, draft-only, hold-intake, or blocked
#   DRAIN_FLEET_GATE_B64  fresh typed fleet receipt; mandatory outside normal
#   DRAIN_RECOVER_FLEET_HOLDS  exact production-controller recovery event only
#   MERGE_QUEUE_BACKEND  native (default); test-label-fixture is test-only
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
  native) ;;
  test-label-fixture)
    if [[ "${DRAIN_MUTATION_AUTHORIZATION:-}" != "test-fixture" ]]; then
      echo "::error::test-label-fixture is restricted to isolated tests" >&2
      exit 2
    fi
    ;;
  *)
    echo "::error::Unknown MERGE_QUEUE_BACKEND: $MERGE_QUEUE_BACKEND" >&2
    exit 2
    ;;
esac
DRAIN_MAX_SECONDS="${DRAIN_MAX_SECONDS:-900}"
DRAIN_ISOLATION_EVAL_TIMEOUT_SECONDS="${DRAIN_ISOLATION_EVAL_TIMEOUT_SECONDS:-45}"
if [[ ! "$DRAIN_ISOLATION_EVAL_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]] \
  || (( DRAIN_ISOLATION_EVAL_TIMEOUT_SECONDS > DRAIN_MAX_SECONDS )); then
  echo "::error::DRAIN_ISOLATION_EVAL_TIMEOUT_SECONDS must be positive and no larger than DRAIN_MAX_SECONDS" >&2
  exit 2
fi
DRAIN_STARTED_AT="$SECONDS"
# `queue-deferred` is a hard hold. Typed provenance now exists as
# `jovie-queue-deferral/v1` (scripts/lib/queue-deferral-receipt.mjs), and the
# queue-deferred release controller (scripts/release-queue-deferred.sh) owns
# lifting mechanical holds before enrollment. This reconcile path stays
# disabled: without a typed receipt on the exact head, main maintenance still
# cannot distinguish temporary queue pressure from a repair/human hold. A
# prior main-push reconciliation removed explicit repair holds and its
# `unlabeled` events immediately re-admitted those exact heads.
DRAIN_RECONCILE_QUEUE_DEFERRED="${DRAIN_RECONCILE_QUEUE_DEFERRED:-0}"
DRAIN_ADMISSION_PR="${DRAIN_ADMISSION_PR:-}"
DRAIN_ADMISSION_HEAD="${DRAIN_ADMISSION_HEAD:-}"
DRAIN_PROMOTION_MODE="${DRAIN_PROMOTION_MODE:-normal}"
DRAIN_FLEET_GATE_B64="${DRAIN_FLEET_GATE_B64:-}"
DRAIN_RECOVER_FLEET_HOLDS="${DRAIN_RECOVER_FLEET_HOLDS:-0}"
FLEET_HOLD_CONTEXT="jovie-fleet-queue-hold/v1"
# A successful native enrollment leaves a bot-authored, exact-head receipt.
# A completed CI merge_group has no source PR head to admit, but it is the
# authoritative signal that GitHub may just have ejected unmerged cohort
# members while main advanced. The controller may reconcile only these
# receipts, never the whole clean backlog.
DRAIN_RECONCILE_QUEUE_REENTRY="${DRAIN_RECONCILE_QUEUE_REENTRY:-0}"
DRAIN_QUEUE_REENTRY_MAX_PER_RUN="${DRAIN_QUEUE_REENTRY_MAX_PER_RUN:-2}"
QUEUE_REENTRY_CONTEXT="jovie-queue-reentry/v1"
QUEUE_DEFERRED_RELEASE_LIB="$(dirname "${BASH_SOURCE[0]}")/lib/queue-deferred-release-admission.mjs"
PRODUCTION_UNBOUND_REPAIR_ATTESTATION_LIB="$(dirname "${BASH_SOURCE[0]}")/lib/production-unbound-repair-attestation.mjs"
QUEUE_DEFERRED_RELEASE_MARKER='<!-- bot-comment:queue-deferred-release -->'
QUEUE_DEFERRED_RELEASE_ACTOR='jovie-bot[bot]'
FLEET_GATE_JSON=""
case "$DRAIN_PROMOTION_MODE" in
  normal) ;;
  isolated-only | draft-only | blocked | hold-intake | deferred-release-only)
    if [[ -z "$DRAIN_FLEET_GATE_B64" ]]; then
      echo "::error::Refusing $DRAIN_PROMOTION_MODE without a fresh typed fleet receipt" >&2
      exit 2
    fi
    if ! FLEET_GATE_JSON="$(node -e '
      const value = Buffer.from(process.argv[1], "base64").toString("utf8");
      const receipt = JSON.parse(value);
      const observed = Date.parse(receipt.observedAt || "");
      const now = Date.now();
      if (!Number.isFinite(observed) || observed > now + 60_000 || now - observed > 600_000) {
        throw new Error("stale fleet receipt");
      }
      process.stdout.write(JSON.stringify(receipt));
    ' "$DRAIN_FLEET_GATE_B64" 2>/dev/null)"; then
      echo "::error::Refusing $DRAIN_PROMOTION_MODE with a malformed or stale fleet receipt" >&2
      exit 2
    fi
    if [[ "$DRAIN_PROMOTION_MODE" == "deferred-release-only" ]]; then
      if ! node "$QUEUE_DEFERRED_RELEASE_LIB" fleet <<<"$FLEET_GATE_JSON" \
        | jq -e '.allowed == true and .mode == "deferred-release-only"' >/dev/null; then
        echo "::error::Fleet receipt does not authorize the exact queue-deferred release fallback" >&2
        exit 2
      fi
    elif ! jq -e --arg mode "$DRAIN_PROMOTION_MODE" '
      .schema == "jovie-fleet-gate/v1" and
      .promotionMode == $mode and
      if $mode == "isolated-only" then
        .signals.main.status == "green" and
        .signals.production.status == "red" and
        .isolatedPromotionAdmission.allowed == true and
        .isolatedPromotionAdmission.deploymentsAllowed == false
      elif $mode == "draft-only" then
        .signals.main.status == "red" and
        (.signals.integrity.status | IN("clear", "resolved")) and
        .promotionAdmission.allowed == false and
        .isolatedPromotionAdmission.allowed == false
      elif $mode == "hold-intake" then
        .state == "AMBER" and
        .signals.main.status == "green" and
        .signals.production.status == "green" and
        .promotionAdmission.allowed == false and
        .isolatedPromotionAdmission.allowed == false and
        (.productionUnboundRepairAdmission.allowed | type == "boolean") and
        (if .productionUnboundRepairAdmission.allowed then
          .productionUnboundRepairAdmission.condition == "production-deployment-unbound" and
          (.productionUnboundRepairAdmission.mainSha | test("^[0-9a-f]{40}$")) and
          (.productionUnboundRepairAdmission.deployedSha | test("^[0-9a-f]{7,40}$")) and
          .productionUnboundRepairAdmission.mainSha != .productionUnboundRepairAdmission.deployedSha
        else
          .productionUnboundRepairAdmission.condition == null and
          .productionUnboundRepairAdmission.mainSha == null and
          .productionUnboundRepairAdmission.deployedSha == null
        end) and
        .productionUnboundRepairAdmission.maxConcurrent == 1 and
        .productionUnboundRepairAdmission.deploymentsAllowed == false and
        .alreadyAdmittedCohort.preserve == true and
        .alreadyAdmittedCohort.newIntakeAllowed == true
      else
        .promotionAdmission.allowed == false and
        .isolatedPromotionAdmission.allowed == false
      end
    ' <<<"$FLEET_GATE_JSON" >/dev/null; then
      echo "::error::Fleet receipt does not authorize promotion mode $DRAIN_PROMOTION_MODE" >&2
      exit 2
    fi
    ;;
  *)
    echo "::error::Unknown DRAIN_PROMOTION_MODE: $DRAIN_PROMOTION_MODE" >&2
    exit 2
    ;;
esac
if [[ "$DRAIN_RECOVER_FLEET_HOLDS" != "0" && "$DRAIN_RECOVER_FLEET_HOLDS" != "1" ]]; then
  echo "::error::DRAIN_RECOVER_FLEET_HOLDS must be 0 or 1" >&2
  exit 2
fi
if [[ "$DRAIN_RECOVER_FLEET_HOLDS" == "1" && "$DRAIN_PROMOTION_MODE" != "normal" ]]; then
  echo "::error::Fleet holds may recover only under normal GREEN promotion" >&2
  exit 2
fi
if [[ "$DRAIN_RECONCILE_QUEUE_REENTRY" != "0" && "$DRAIN_RECONCILE_QUEUE_REENTRY" != "1" ]]; then
  echo "::error::DRAIN_RECONCILE_QUEUE_REENTRY must be 0 or 1" >&2
  exit 2
fi
if [[ "$DRAIN_RECONCILE_QUEUE_REENTRY" == "1" && "$DRAIN_PROMOTION_MODE" != "normal" ]]; then
  echo "::error::Queue re-entry recovery may run only under normal GREEN promotion" >&2
  exit 2
fi
if [[ ! "$DRAIN_QUEUE_REENTRY_MAX_PER_RUN" =~ ^[1-9][0-9]*$ ]] \
  || (( DRAIN_QUEUE_REENTRY_MAX_PER_RUN > 3 )); then
  echo "::error::DRAIN_QUEUE_REENTRY_MAX_PER_RUN must be an integer from 1 through 3" >&2
  exit 2
fi
if [[ -z "$DRAIN_ADMISSION_PR" && -z "$DRAIN_ADMISSION_HEAD" ]]; then
  : # Maintenance-only: global dequeue/reconciliation remains authorized.
else
  normalized_admission_head="$(printf '%s' "$DRAIN_ADMISSION_HEAD" | tr '[:upper:]' '[:lower:]')"
  if [[ "$DRAIN_ADMISSION_PR" =~ ^[1-9][0-9]*$ && "$normalized_admission_head" =~ ^[0-9a-f]{40}$ ]]; then
    DRAIN_ADMISSION_HEAD="$normalized_admission_head"
  else
    echo "::error::Refusing malformed admission scope; expected exact PR number + 40-character head SHA" >&2
    exit 2
  fi
fi

# The queue-deferred release workflow writes this receipt *before* removing
# the hold. It is the shared pre-enqueue guard for the narrow fallback mode:
# an `unlabeled` event, a green check, or a matching PR number alone is never
# enough authority to enroll while ordinary promotion is blocked.
deferred_release_receipt_for_pr() {  # <pr>
  local raw body
  raw="$(gh_retry api "repos/${REPO}/issues/${1}/comments" --paginate --slurp 2>/dev/null || true)"
  [[ -n "$raw" ]] || return 0
  body="$(jq -r --arg marker "$QUEUE_DEFERRED_RELEASE_MARKER" --arg actor "$QUEUE_DEFERRED_RELEASE_ACTOR" '
    [ .[][]?
      | select(.user.login == $actor)
      | select((.body | type == "string") and (.body | contains($marker)))
      | .body
    ] | last // empty
  ' <<<"$raw" 2>/dev/null || true)"
  [[ -n "$body" ]] || return 0
  node "$QUEUE_DEFERRED_RELEASE_LIB" extract <<<"$body" 2>/dev/null || true
}

# The production-unbound exception is a typed exact PR/head/current-main
# statement, revalidated before and after native enrollment. Source checks and
# hard holds remain independent enrollment gates.
production_unbound_repair_attestation_matches() {  # <body> <pr> <head> <main-sha>
  local body="$1" pr="$2" head="$3" main_sha="$4"
  printf '%s' "$body" | node "$PRODUCTION_UNBOUND_REPAIR_ATTESTATION_LIB" matches \
    --pr "$pr" --head "$head" --main-sha "$main_sha" >/dev/null 2>&1
}

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

fleet_hold_target_url() {
  local run_id="${GITHUB_RUN_ID:-}"
  local server_url="${GITHUB_SERVER_URL:-https://github.com}"
  if [[ ! "$run_id" =~ ^[1-9][0-9]*$ ]]; then
    return 1
  fi
  printf '%s/%s/actions/runs/%s' "$server_url" "$REPO" "$run_id"
}

record_fleet_hold() {  # record_fleet_hold <num> <expected-head>
  local n="$1" expected_head="$2" current live_head target_url
  if [[ ! "$expected_head" =~ ^[0-9a-f]{40}$ ]]; then
    echo "    !! cannot record fleet hold for #$n without an exact head" >&2
    return 1
  fi
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "    [dry-run] would record $FLEET_HOLD_CONTEXT on #$n at $expected_head"
    return 0
  fi
  if ! target_url="$(fleet_hold_target_url)"; then
    echo "    !! canonical workflow run identity is missing for fleet hold #$n" >&2
    return 1
  fi
  if ! current="$(gh_retry pr view "$n" -R "$REPO" --json state,headRefOid 2>/dev/null)"; then
    echo "    !! could not refresh #$n before recording fleet hold" >&2
    return 1
  fi
  live_head="$(jq -r '(.headRefOid // "") | ascii_downcase' <<<"$current")"
  if ! jq -e --arg head "$expected_head" '
    .state == "OPEN" and ((.headRefOid // "") | ascii_downcase) == $head
  ' <<<"$current" >/dev/null; then
    echo "    ⏸ #$n head changed before fleet hold; refusing dequeue"
    return 2
  fi
  if ! gh_retry api -X POST "repos/$REPO/statuses/$live_head" \
    -f state=pending \
    -f context="$FLEET_HOLD_CONTEXT" \
    -f description="Held by canonical fleet controller ($DRAIN_PROMOTION_MODE)" \
    -f target_url="$target_url" >/dev/null; then
    echo "    !! failed to record exact-head fleet hold for #$n" >&2
    return 1
  fi
  echo "    +$FLEET_HOLD_CONTEXT on #$n at $live_head"
}

fleet_hold_is_recoverable() {  # fleet_hold_is_recoverable <head>
  local head="$1" statuses
  [[ "$head" =~ ^[0-9a-f]{40}$ ]] || return 1
  if ! statuses="$(gh_retry api "repos/$REPO/commits/$head/status" 2>/dev/null)"; then
    return 1
  fi
  jq -e --arg context "$FLEET_HOLD_CONTEXT" --arg repo "$REPO" '
    [ .statuses[]? | select(.context == $context) ]
    | sort_by(.updated_at)
    | last
    | .state == "pending"
      and (.creator.type == "Bot")
      and (.target_url | test("^https://github\\.com/" + ($repo | gsub("/"; "\\/")) + "/actions/runs/[1-9][0-9]*$"))
  ' <<<"$statuses" >/dev/null
}

clear_fleet_hold() {  # clear_fleet_hold <num> <head>
  local n="$1" head="$2" target_url
  if ! target_url="$(fleet_hold_target_url)"; then
    echo "    !! could not resolve controller run while clearing fleet hold #$n" >&2
    return 1
  fi
  if gh_retry api -X POST "repos/$REPO/statuses/$head" \
    -f state=success \
    -f context="$FLEET_HOLD_CONTEXT" \
    -f description="Recovered by canonical fleet controller at exact head" \
    -f target_url="$target_url" >/dev/null; then
    echo "    -$FLEET_HOLD_CONTEXT on #$n at $head"
    return 0
  fi
  echo "    !! #$n enrolled, but exact-head fleet hold receipt did not close" >&2
  return 1
}

# A native queue admission is durable only when a bot-authored, exact-head
# receipt survives the transient queue membership. It is deliberately a commit
# status rather than a label: labels are intent/audit only and can be mutated
# without changing the source revision. The receipt is never sufficient on its
# own; recovery still re-reads current PR state, current source checks, and the
# native queue postcondition.
queue_reentry_receipt_is_recoverable() {  # <head>
  local head="$1" statuses
  [[ "$head" =~ ^[0-9a-f]{40}$ ]] || return 1
  if ! statuses="$(gh_retry api "repos/$REPO/commits/$head/status" 2>/dev/null)"; then
    return 1
  fi
  jq -e --arg context "$QUEUE_REENTRY_CONTEXT" --arg repo "$REPO" '
    [ .statuses[]? | select(.context == $context) ]
    | sort_by(.updated_at)
    | last
    | .state == "success"
      and (.creator.type == "Bot")
      and (.description == "Native queue admission recorded at exact head")
      and (.target_url | test("^https://github\\.com/" + $repo + "/actions/runs/[1-9][0-9]*$"))
  ' <<<"$statuses" >/dev/null
}

record_queue_reentry_receipt() {  # <pr> <expected-head>
  local n="$1" expected_head="$2" current live_head target_url
  if [[ ! "$expected_head" =~ ^[0-9a-f]{40}$ ]]; then
    echo "    !! cannot record queue re-entry receipt for #$n without an exact head" >&2
    return 1
  fi
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "    [dry-run] would record $QUEUE_REENTRY_CONTEXT on #$n at $expected_head"
    return 0
  fi
  # Re-enrollment of an already-receipted immutable head is intentionally
  # idempotent. Do not create an unbounded stream of duplicate statuses.
  if queue_reentry_receipt_is_recoverable "$expected_head"; then
    echo "    =$QUEUE_REENTRY_CONTEXT on #$n at $expected_head (already recorded)"
    return 0
  fi
  if ! target_url="$(fleet_hold_target_url)"; then
    echo "    !! canonical workflow run identity is missing for queue re-entry receipt #$n" >&2
    return 1
  fi
  if ! current="$(gh_retry pr view "$n" -R "$REPO" --json state,headRefOid 2>/dev/null)"; then
    echo "    !! could not refresh #$n before recording queue re-entry receipt" >&2
    return 1
  fi
  live_head="$(jq -r '(.headRefOid // "") | ascii_downcase' <<<"$current")"
  if ! jq -e --arg head "$expected_head" '
    .state == "OPEN" and ((.headRefOid // "") | ascii_downcase) == $head
  ' <<<"$current" >/dev/null; then
    echo "    ⏸ #$n head changed before queue re-entry receipt; compensating enrollment"
    return 2
  fi
  if ! gh_retry api -X POST "repos/$REPO/statuses/$live_head" \
    -f state=success \
    -f context="$QUEUE_REENTRY_CONTEXT" \
    -f description="Native queue admission recorded at exact head" \
    -f target_url="$target_url" >/dev/null; then
    echo "    !! failed to record exact-head queue re-entry receipt for #$n" >&2
    return 1
  fi
  echo "    +$QUEUE_REENTRY_CONTEXT on #$n at $live_head"
}

deferred_state_is_releasable() {  # state json <expected head> <expected base>
  jq -e --arg expected_head "$2" --arg expected_base "$3" '
    .state == "OPEN"
    and (.isDraft | not)
    and .mergeable == "MERGEABLE"
    and (.headRefOid // "") == $expected_head
    and .baseRefName == "main"
    and (.baseRefOid // "") == $expected_base
    and .autoMergeRequest != null
    and ([.labels[].name] | index("queue-deferred")) != null
    and ([.labels[].name] | any(
      . == "needs-human" or . == "hold" or . == "gated"
      or . == "fast" or . == "needs-conflict-resolution"
    ) | not)
  ' <<<"$1" >/dev/null
}

restore_deferred_hold() {  # restore_deferred_hold <num>
  local n="$1"
  [[ "$DRY_RUN" == "1" ]] && return 0
  if gh_retry pr edit "$n" -R "$REPO" --add-label queue-deferred >/dev/null 2>&1; then
    echo "    +queue-deferred on #$n (compensated changed release state)"
    return 0
  fi
  echo "    !! could not compensate queue-deferred release for #$n" >&2
  return 1
}

# Release only a previously pressure-deferred PR after main advances. This is
# intentionally called only by Merge Queue Auto-Enroll's existing `push: main`
# path. A candidate must be live/current, retain its auto-merge request, have
# no stronger hold, and pass the same canonical source-gate classifier used by
# normal enrollment. Any race restores the deferral hold rather than enrolling
# an unproven revision.
reconcile_deferred_auto_merge_after_main_push() {
  [[ "$DRAIN_RECONCILE_QUEUE_DEFERRED" == "1" ]] || return 0

  echo "=== RECONCILE (disabled; preserving queue-deferred holds) ==="
  echo "  ~ no typed pressure-deferral provenance; owner release required"
  return 0

  local main_oid candidates pr n expected_head before failures before_release after
  echo "=== RECONCILE (current auto-merge deferred PRs after main push) ==="

  if ! main_oid="$(gh_retry api "repos/${REPO}/git/ref/heads/main" --jq '.object.sha' 2>/dev/null)" \
    || [[ ! "$main_oid" =~ ^[0-9a-fA-F]{40}$ ]]; then
    echo "  !! could not resolve exact main SHA; preserving queue-deferred holds" >&2
    return 0
  fi
  main_oid="$(printf '%s' "$main_oid" | tr '[:upper:]' '[:lower:]')"

  if ! candidates="$(gh_retry pr list -R "$REPO" --state open --limit 200 \
    --json number,isDraft,mergeable,labels,headRefOid,baseRefName,baseRefOid --jq '
      [ .[] | select(.isDraft == false) | select(.mergeable == "MERGEABLE")
        | select(.baseRefName == "main")
        | select([.labels[].name] | index("queue-deferred"))
        | { n: .number, head: (.headRefOid // ""), base: (.baseRefOid // "") } ]')"; then
    echo "  !! could not read deferred PR candidates; preserving holds" >&2
    return 0
  fi

  while IFS= read -r pr; do
    stop_if_budget_exhausted && break
    n="$(jq -r '.n' <<<"$pr")"
    expected_head="$(jq -r '.head // ""' <<<"$pr" | tr '[:upper:]' '[:lower:]')"
    expected_base="$(jq -r '.base // ""' <<<"$pr" | tr '[:upper:]' '[:lower:]')"
    echo "  #$n"

    if [[ ! "$expected_head" =~ ^[0-9a-f]{40}$ || "$expected_base" != "$main_oid" ]]; then
      echo "    ~ not based on current main; preserving deferral"
      continue
    fi

    if ! before="$(gh_retry pr view "$n" -R "$REPO" \
      --json state,isDraft,mergeable,headRefOid,baseRefName,baseRefOid,labels,autoMergeRequest 2>/dev/null)"; then
      echo "    ~ could not read live state; preserving deferral"
      continue
    fi
    if ! deferred_state_is_releasable "$before" "$expected_head" "$main_oid"; then
      echo "    ~ live state is not a current, clean auto-merge defer; preserving"
      continue
    fi

    failures="$(check_failures_for_pr "$n")"
    if [[ "$(jq 'length' <<<"$failures")" -ne 0 ]]; then
      echo "    ~ canonical source gates are not green: $(jq -r 'join(", ")' <<<"$failures")"
      continue
    fi

    # Re-read after checks so neither a new head nor a stronger hold can inherit
    # an old source-gate result.
    if ! before_release="$(gh_retry pr view "$n" -R "$REPO" \
      --json state,isDraft,mergeable,headRefOid,baseRefName,baseRefOid,labels,autoMergeRequest 2>/dev/null)"; then
      echo "    ~ could not re-read live state; preserving deferral"
      continue
    fi
    if ! deferred_state_is_releasable "$before_release" "$expected_head" "$main_oid"; then
      echo "    ~ head, base, hold, or auto-merge changed; preserving deferral"
      continue
    fi

    if [[ "$DRY_RUN" == "1" ]]; then
      echo "    [dry-run] would -queue-deferred on #$n"
      continue
    fi
    if ! gh_retry pr edit "$n" -R "$REPO" --remove-label queue-deferred >/dev/null 2>&1; then
      echo "    !! failed to remove queue-deferred on #$n" >&2
      continue
    fi

    if ! after="$(gh_retry pr view "$n" -R "$REPO" \
      --json state,isDraft,mergeable,headRefOid,baseRefName,baseRefOid,labels,autoMergeRequest 2>/dev/null)" \
      || ! jq -e --arg expected_head "$expected_head" --arg expected_base "$main_oid" '
        .state == "OPEN"
        and (.isDraft | not)
        and .mergeable == "MERGEABLE"
        and (.headRefOid // "") == $expected_head
        and .baseRefName == "main"
        and (.baseRefOid // "") == $expected_base
        and .autoMergeRequest != null
        and ([.labels[].name] | index("queue-deferred")) == null
        and ([.labels[].name] | any(
          . == "needs-human" or . == "hold" or . == "gated"
          or . == "fast" or . == "needs-conflict-resolution"
        ) | not)
      ' <<<"$after" >/dev/null; then
      echo "    !! release state changed; restoring queue-deferred hold" >&2
      restore_deferred_hold "$n" || return 1
      continue
    fi
    echo "    -queue-deferred on #$n (current main + exact green head)"
  done < <(jq -c '.[]' <<<"$candidates")
}

# The queue snapshot can be stale by the time enrollment begins. Re-read the
# authoritative PR state immediately before mutation so a draft conversion or
# a queue-deferred hold cannot be overwritten by this controller.
enroll_if_still_eligible() {  # enroll_if_still_eligible <num> [authorized-pr authorized-head]
  local n="$1" authorized_pr="${2:-$DRAIN_ADMISSION_PR}" authorized_head="${3:-$DRAIN_ADMISSION_HEAD}"
  local current enrollment_receipt head_oid expected_head json_fields queue_position queue_state
  json_fields="state,isDraft,mergeable,labels,headRefOid,baseRefName,body"
  if ! current="$(gh_retry pr view "$n" -R "$REPO" \
    --json "$json_fields" 2>/dev/null)"; then
    echo "    !! could not refresh #$n eligibility; refusing enrollment" >&2
    return 1
  fi
  if ! jq -e --arg backend "$MERGE_QUEUE_BACKEND" '
    .state == "OPEN"
    and (.isDraft | not)
    and .mergeable == "MERGEABLE"
    and .baseRefName == "main"
    and ([.labels[].name] | any(
      . == "needs-human" or . == "hold" or . == "gated"
      or . == "queue-deferred" or . == "needs-conflict-resolution"
      or . == "fast" or ($backend == "test-label-fixture" and . == "merge-queue")
    ) | not)
  ' <<<"$current" >/dev/null; then
    echo "    ⏸ eligibility changed; refusing enrollment for #$n"
    return 2
  fi
  head_oid="$(jq -r '.headRefOid // empty' <<<"$current")"
  if [[ ! "$head_oid" =~ ^[0-9a-fA-F]{40}$ ]]; then
    echo "    !! missing exact head SHA for enrollment of #$n" >&2
    return 1
  fi
  expected_head="$(printf '%s' "$head_oid" | tr '[:upper:]' '[:lower:]')"
  if [[ "$n" != "$authorized_pr" || "$expected_head" != "$authorized_head" ]]; then
    echo "    ⏸ event admission scope no longer matches #$n at $expected_head; refusing enrollment"
    return 2
  fi
  # JOV-5116 failure disposition: one classified product-check failure
  # suppresses the unchanged source head across base movement and elapsed
  # time. Unclassified infrastructure failures retain the bounded retry.
  # A new source commit is the recovery signal; unknown evidence never mutates.
  local churn_action
  churn_action="$(front_churn_action "$n" "$expected_head")"
  if [[ "$churn_action" == "block" ]]; then
    echo "    ⏸ unchanged head has a classified/repeated merge-group failure; refusing re-enrollment for #$n until recovery policy allows it"
    return 2
  fi
  if [[ "$DRAIN_PROMOTION_MODE" == "isolated-only" ]]; then
    local isolated_receipt isolated_rc
    set +e
    isolated_receipt="$(node scripts/lib/isolated-ui-docs-policy.mjs evaluate-live \
      --repo="$REPO" --pr="$n" --head="$expected_head" \
      --fleet-gate-b64="$DRAIN_FLEET_GATE_B64" 2>/dev/null)"
    isolated_rc=$?
    set -e
    if [[ "$isolated_rc" -ne 0 ]] || ! jq -e \
      --arg head "$expected_head" \
      --arg pr "$n" '
        .schema == "jovie-isolated-ui-docs/v1" and
        .allowed == true and
        (.pinned.prNumber | tostring) == $pr and
        .pinned.headSha == $head and
        .authority.labelsUsed == false and
        .authority.deploymentAllowed == false
      ' <<<"$isolated_receipt" >/dev/null; then
      echo "    ⏸ exact-head isolated UI/docs receipt is absent or invalid for #$n"
      return 2
    fi
  elif [[ "$DRAIN_PROMOTION_MODE" == "hold-intake" ]]; then
    local repair_main
    repair_main="$(jq -r '.productionUnboundRepairAdmission.mainSha // empty' <<<"$FLEET_GATE_JSON")"
    if ! production_unbound_repair_attestation_matches \
      "$(jq -r '.body // ""' <<<"$current")" "$n" "$expected_head" "$repair_main"; then
      echo "    ⏸ exact active-condition repair attestation is absent for #$n"
      return 2
    fi
  elif [[ "$DRAIN_PROMOTION_MODE" == "deferred-release-only" ]]; then
    local release_receipt
    release_receipt="$(deferred_release_receipt_for_pr "$n")"
    if ! jq -e --arg head "$expected_head" --argjson pr "$n" '
      .schema == "jovie-queue-deferred-release/v1" and
      .pr == $pr and
      .head == $head and
      .mode == "deferred-release-only"
    ' <<<"$release_receipt" >/dev/null 2>&1; then
      echo "    ⏸ exact-head controller queue-deferred release receipt is absent or invalid for #$n"
      return 2
    fi
  elif [[ "$DRAIN_PROMOTION_MODE" != "normal" ]]; then
    echo "    ⏸ fleet mode $DRAIN_PROMOTION_MODE forbids queue enrollment"
    return 2
  fi
  if [[ "$DRY_RUN" == "1" ]]; then
    if [[ "$MERGE_QUEUE_BACKEND" == "test-label-fixture" ]]; then
      echo "    [dry-run] would +merge-queue on #$n"
    else
      echo "    [dry-run] would enroll #$n via native"
    fi
    return 0
  fi
  # native-queue-transport:enrollment:start
  if [[ "$MERGE_QUEUE_BACKEND" == "native" ]]; then
    if ! enrollment_receipt="$(node scripts/merge-queue-backend.mjs enroll "$n" "$head_oid")"; then
      echo "    !! native enrollment/postcondition failed for #$n" >&2
      if ! dequeue_strict "$n"; then
        echo "    !! CRITICAL: could not compensate unproven native enrollment for #$n" >&2
      fi
      return 1
    fi
    if ! jq -e --arg expected_head "$expected_head" '
      .state.state == "OPEN"
      and (.state.isDraft | not)
      and ((.state.headRefOid // "") | ascii_downcase) == $expected_head
      and (.state.mergeQueueEntry.state | IN("QUEUED", "AWAITING_CHECKS", "MERGEABLE", "UNMERGEABLE", "LOCKED"))
      and (.state.mergeQueueEntry.position | type == "number" and floor == . and . > 0)
    ' <<<"$enrollment_receipt" >/dev/null; then
      echo "    !! native enrollment returned no exact-head positioned queue receipt for #$n" >&2
      if ! dequeue_strict "$n"; then
        echo "    !! CRITICAL: could not compensate malformed native enrollment receipt for #$n" >&2
      fi
      return 1
    fi

    # Labels do not change the head SHA, so expected-head protection alone
    # cannot close the hard-gate race. Re-read after native enrollment and
    # compensate immediately if a gated/held label appeared while the queue
    # mutation was in flight.
    if ! current="$(gh_retry pr view "$n" -R "$REPO" \
      --json state,isDraft,mergeable,labels,headRefOid,baseRefName,body 2>/dev/null)"; then
      echo "    !! could not refresh #$n after native enrollment; compensating" >&2
      if ! dequeue_strict "$n"; then
        echo "    !! CRITICAL: could not compensate uncertain native enrollment for #$n" >&2
        return 1
      fi
      return 2
    fi
    if ! jq -e --arg expected_head "$expected_head" '
      .state == "OPEN"
      and (.isDraft | not)
      and .mergeable == "MERGEABLE"
      and .baseRefName == "main"
      and ((.headRefOid // "") | ascii_downcase) == $expected_head
      and ([.labels[].name] | any(
        . == "needs-human" or . == "hold" or . == "gated"
        or . == "queue-deferred" or . == "needs-conflict-resolution"
        or . == "fast"
      ) | not)
    ' <<<"$current" >/dev/null; then
      echo "    ⏸ eligibility changed during native enrollment for #$n; compensating"
      if ! dequeue_strict "$n"; then
        echo "    !! CRITICAL: could not compensate held native enrollment for #$n" >&2
        return 1
      fi
      return 2
    fi
    if [[ "$DRAIN_PROMOTION_MODE" == "hold-intake" ]]; then
      repair_main="$(jq -r '.productionUnboundRepairAdmission.mainSha // empty' <<<"$FLEET_GATE_JSON")"
      if ! production_unbound_repair_attestation_matches \
        "$(jq -r '.body // ""' <<<"$current")" "$n" "$expected_head" "$repair_main"; then
        echo "    ⏸ repair attestation changed during native enrollment for #$n; compensating"
        dequeue_strict "$n" || return 1
        return 2
      fi
    fi

    if [[ "$DRAIN_PROMOTION_MODE" == "deferred-release-only" ]]; then
      release_receipt="$(deferred_release_receipt_for_pr "$n")"
      if ! jq -e --arg head "$expected_head" --argjson pr "$n" '
        .schema == "jovie-queue-deferred-release/v1" and
        .pr == $pr and .head == $head and .mode == "deferred-release-only"
      ' <<<"$release_receipt" >/dev/null 2>&1; then
        echo "    ⏸ controller release evidence changed during native enrollment for #$n; compensating"
        dequeue_strict "$n" || return 1
        return 2
      fi
    fi

    # PR descriptions and check state can change without changing the source
    # head. Re-evaluate the semantic/evidence receipt after enrollment and
    # compensate if any exact-head prerequisite changed during mutation.
    if [[ "$DRAIN_PROMOTION_MODE" == "isolated-only" ]]; then
      set +e
      isolated_receipt="$(node scripts/lib/isolated-ui-docs-policy.mjs evaluate-live \
        --repo="$REPO" --pr="$n" --head="$expected_head" \
        --fleet-gate-b64="$DRAIN_FLEET_GATE_B64" 2>/dev/null)"
      isolated_rc=$?
      set -e
      if [[ "$isolated_rc" -ne 0 ]] || ! jq -e \
        --arg head "$expected_head" \
        --arg pr "$n" '
          .schema == "jovie-isolated-ui-docs/v1" and
          .allowed == true and
          (.pinned.prNumber | tostring) == $pr and
          .pinned.headSha == $head and
          .authority.labelsUsed == false and
          .authority.deploymentAllowed == false
        ' <<<"$isolated_receipt" >/dev/null; then
        echo "    ⏸ isolated evidence changed during native enrollment for #$n; compensating"
        if ! dequeue_strict "$n"; then
          echo "    !! CRITICAL: could not compensate changed isolated enrollment for #$n" >&2
          return 1
        fi
        return 2
      fi
    fi

    # Retain a typed exact-head record before treating the native queue
    # mutation as complete. A later merge_group workflow_run has a composite
    # head, not a PR head; this receipt is the only bounded bridge that can
    # recover a member GitHub ejects after main advances. If it cannot be
    # written, compensate the just-proven queue membership rather than leave
    # a PR that future event loss cannot safely recover.
    if ! record_queue_reentry_receipt "$n" "$expected_head"; then
      echo "    !! native enrollment lacks durable exact-head re-entry receipt; compensating" >&2
      if ! dequeue_strict "$n"; then
        echo "    !! CRITICAL: could not compensate native enrollment without re-entry receipt for #$n" >&2
      fi
      return 1
    fi

    # The degraded-observation fallback is intentionally allowed to clear only
    # a bot-authored, exact-head fleet hold after enrollment. It cannot clear
    # a human label or an arbitrary pending status, and it does not recover
    # any other queued member.
    if [[ "$DRAIN_PROMOTION_MODE" == "deferred-release-only" ]] \
      && fleet_hold_is_recoverable "$expected_head"; then
      clear_fleet_hold "$n" "$expected_head" || return 1
    fi
    queue_position="$(jq -r '.state.mergeQueueEntry.position' <<<"$enrollment_receipt")"
    queue_state="$(jq -r '.state.mergeQueueEntry.state' <<<"$enrollment_receipt")"
    echo "    +native-queue on #$n at $head_oid (state $queue_state, position $queue_position)"
    return 0
  fi
  # native-queue-transport:enrollment:end
  if ! gh_retry pr edit "$n" -R "$REPO" --add-label merge-queue >/dev/null; then
    echo "    !! failed to add merge-queue on #$n" >&2
    return 1
  fi
  if ! current="$(gh_retry pr view "$n" -R "$REPO" \
    --json state,isDraft,mergeable,labels 2>/dev/null)"; then
    echo "    !! could not verify #$n after enrollment" >&2
    if ! dequeue_strict "$n"; then
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
  if ! dequeue_strict "$n"; then
    echo "    !! CRITICAL: could not prove failed enrollment was compensated for #$n" >&2
  fi
  return 1
}

dequeue_strict() {  # dequeue_strict <num>
  local n="$1" current
  if [[ "$DRY_RUN" == "1" ]]; then
    if [[ "$MERGE_QUEUE_BACKEND" == "native" ]]; then
      echo "    [dry-run] would dequeue #$n from native"
    else
      echo "    [dry-run] would -merge-queue on #$n"
    fi
    return 0
  fi
  # native-queue-transport:dequeue:start
  if [[ "$MERGE_QUEUE_BACKEND" == "native" ]]; then
    if ! node scripts/merge-queue-backend.mjs dequeue "$n" >/dev/null; then
      echo "    !! failed to prove native dequeue for held PR #$n" >&2
      return 1
    fi
    echo "    -native-queue on #$n"
    return 0
  fi
  # native-queue-transport:dequeue:end
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

reconcile_deferred_auto_merge_after_main_push

SNAP="$(gh_retry pr list -R "$REPO" --state open --limit 200 \
  --json number,title,body,isDraft,mergeable,mergeStateStatus,labels,headRefName,headRefOid,baseRefName --jq '
  [ .[] | {
    n: .number,
    t: (.title[0:48]),
    draft: .isDraft,
    m: .mergeable,
    ms: (.mergeStateStatus // "UNKNOWN"),
    head: .headRefName,
    headOid: ((.headRefOid // "") | ascii_downcase),
    base: .baseRefName,
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

fi

# Merge-group churn evidence (JOV-5030). Each native group build runs on
# gh-readonly-queue/main/pr-<front>-<exactBaseSha>, so recent merge_group CI
# runs identify which PR fronted each attempt and against which exact main
# base. Read-only: when either fetch fails the churn guard degrades to
# 'unknown', enrollment keeps its pre-guard behavior, and no dequeue mutation
# may fire on unproven evidence.
MAIN_HEAD_SHA=""
MERGE_GROUP_RUNS_JSON="[]"
if [[ "$MERGE_QUEUE_BACKEND" == "native" ]]; then
  MAIN_HEAD_SHA="$(gh_retry api "repos/${REPO}/git/ref/heads/main" --jq '.object.sha // empty' 2>/dev/null || true)"
  MAIN_HEAD_SHA="$(printf '%s' "$MAIN_HEAD_SHA" | tr '[:upper:]' '[:lower:]')"
  MERGE_GROUP_RUNS_JSON="$(gh_retry api "repos/${REPO}/actions/workflows/ci.yml/runs?event=merge_group&per_page=50" \
    --jq '[.workflow_runs[]? | {id, headBranch, status, conclusion, headSha, createdAt, updatedAt}]' 2>/dev/null || echo '[]')"
  export MERGE_GROUP_RUNS_JSON
fi

# front_churn_action <num> <head_oid> → prints allow|block|unknown.
front_churn_action() {
  local n="$1" head_oid="$2" committed run_id jobs_json runs_json
  if [[ "$MERGE_QUEUE_BACKEND" != "native" || ! "$MAIN_HEAD_SHA" =~ ^[0-9a-f]{40}$ ]]; then
    echo "unknown"
    return 0
  fi
  committed="$(gh_retry api "repos/${REPO}/commits/${head_oid}" --jq '.commit.committer.date // empty' 2>/dev/null || true)"
  runs_json="$MERGE_GROUP_RUNS_JSON"
  run_id="$(jq -r --arg prefix "gh-readonly-queue/main/pr-${n}-" '
    [.[]
      | select((.headBranch // "") | startswith($prefix))
      | select(.status == "completed")
      | select(.conclusion == "failure" or .conclusion == "timed_out"
        or .conclusion == "action_required" or .conclusion == "startup_failure"
        or .conclusion == "stale")]
    | sort_by(.createdAt) | reverse | .[0].id // empty
  ' <<<"$runs_json")"
  if [[ "$run_id" =~ ^[1-9][0-9]*$ ]]; then
    jobs_json="$(gh_retry api "repos/${REPO}/actions/runs/${run_id}/jobs?per_page=100" --paginate \
      --jq '[.jobs[]? | .steps[]? | select(.conclusion == "failure") | .name]' 2>/dev/null || echo '[]')"
    if jq -e 'type == "array" and all(.[]; type == "string")' <<<"$jobs_json" >/dev/null; then
      runs_json="$(jq -c --argjson run_id "$run_id" --argjson failed_steps "$jobs_json" '
        map(if .id == $run_id then . + {failedSteps: $failed_steps} else . end)
      ' <<<"$runs_json")"
    fi
  fi
  MERGE_GROUP_RUNS_JSON="$runs_json" node scripts/ci-merge-queue-check.mjs front-churn \
    --pr="$n" --base="$MAIN_HEAD_SHA" --head-committed-at="$committed" 2>/dev/null \
    | jq -r '.action // "unknown"'
}

# Production-red mode permits one exact-head exception. Evaluate only native
# queue members plus the single event-scoped candidate. Positive labels are
# deliberately absent from this authority; every unknown returns iso=false.
if [[ "$DRAIN_PROMOTION_MODE" == "isolated-only" ]]; then
  # Preserve the complete authoritative snapshot. Budget-limited entries stay
  # fail-closed instead of disappearing before the fleet-freeze pass.
  CLASSIFIED="$(jq -c 'map(. + {iso: false})' <<<"$SNAP")"
  while IFS= read -r pr; do
    stop_if_budget_exhausted && break
    n="$(jq -r '.n' <<<"$pr")"
    head_oid="$(jq -r '.headOid // ""' <<<"$pr")"
    eligible=false
    if jq -e --arg admission "$DRAIN_ADMISSION_PR" '
      .q == true or ((.n | tostring) == $admission)
    ' <<<"$pr" >/dev/null && [[ "$head_oid" =~ ^[0-9a-f]{40}$ ]]; then
      set +e
      isolation_receipt="$(timeout "${DRAIN_ISOLATION_EVAL_TIMEOUT_SECONDS}s" \
        node scripts/lib/isolated-ui-docs-policy.mjs evaluate-live \
        --repo="$REPO" --pr="$n" --head="$head_oid" \
        --fleet-gate-b64="$DRAIN_FLEET_GATE_B64" 2>/dev/null)"
      isolation_rc=$?
      set -e
      if [[ "$isolation_rc" -eq 0 ]] \
        && jq -e '.allowed == true' <<<"$isolation_receipt" >/dev/null; then
        eligible=true
      fi
    fi
    CLASSIFIED="$(jq -c --argjson n "$n" --argjson eligible "$eligible" \
      'map(if .n == $n then . + {iso: $eligible} else . end)' <<<"$CLASSIFIED")"
  done < <(jq -c '.[]' <<<"$SNAP")
  SNAP="$CLASSIFIED"
elif [[ "$DRAIN_PROMOTION_MODE" == "hold-intake" ]]; then
  REPAIR_MAIN_SHA="$(jq -r '.productionUnboundRepairAdmission.mainSha // empty' <<<"$FLEET_GATE_JSON")"
  CLASSIFIED="$(jq -c 'map(. + {iso: false, unboundRepair: false})' <<<"$SNAP")"
  while IFS= read -r pr; do
    n="$(jq -r '.n' <<<"$pr")"
    head_oid="$(jq -r '.headOid // ""' <<<"$pr")"
    eligible=false
    if [[ "$head_oid" =~ ^[0-9a-f]{40}$ ]] \
      && production_unbound_repair_attestation_matches \
        "$(jq -r '.body // ""' <<<"$pr")" "$n" "$head_oid" "$REPAIR_MAIN_SHA"; then
      eligible=true
    fi
    CLASSIFIED="$(jq -c --argjson n "$n" --argjson eligible "$eligible" \
      'map(if .n == $n then . + {unboundRepair: $eligible} else . end)' <<<"$CLASSIFIED")"
  done < <(jq -c '.[]' <<<"$SNAP")
  SNAP="$CLASSIFIED"
else
  SNAP="$(jq -c 'map(. + {iso: false, unboundRepair: false})' <<<"$SNAP")"
fi

ENRICHED="$(jq -c 'map(. + {fail: ["required check status unavailable"]})' <<<"$SNAP")"
while IFS= read -r pr; do
  stop_if_budget_exhausted && break
  n="$(jq -r '.n' <<<"$pr")"
  fail="[]"
  if jq -e '
    (.draft | not)
    and (.base == "main")
    and (.m == "MERGEABLE")
    and (([.L[]] | any(. == "needs-human" or . == "hold" or . == "gated" or . == "queue-deferred" or . == "fast")) | not)
  ' <<<"$pr" >/dev/null; then
    fail="$(check_failures_for_pr "$n")"
  fi
  # Guard: check_failures_for_pr might return non-JSON under transient gh errors.
  # Unknown check state is a blocker, never permission to enqueue.
  if ! jq -e . <<<"$fail" >/dev/null 2>&1; then
    fail='["required check status unavailable"]'
  fi
  ENRICHED="$(jq -c --argjson n "$n" --argjson fail "$fail" \
    'map(if .n == $n then . + {fail: $fail} else . end)' <<<"$ENRICHED")"
done < <(jq -c '.[]' <<<"$SNAP")
SNAP="$ENRICHED"

# Non-normal modes freeze existing native queue entries except hold-intake.
# hold-intake preserves the promotion cohort while isolated implementation
# intake continues; it does not authorize new promotion or deployment. This
# prevents Production Controller latency from serializing coding work.
# isolated-only may keep one freshly proven isolated entry; draft-only and
# blocked preserve none.
DRAIN_FREEZE_EXISTING_QUEUE=0
if [[ "$DRAIN_PROMOTION_MODE" != "normal" \
  && "$DRAIN_PROMOTION_MODE" != "hold-intake" \
  && "$DRAIN_PROMOTION_MODE" != "deferred-release-only" ]]; then
  DRAIN_FREEZE_EXISTING_QUEUE=1
fi

# --- SUMMARY: make queue shape obvious in scheduled logs ---
echo "=== QUEUE SUMMARY ==="
echo "$SNAP" | jq -r '
  def labels: (.L // []);
  def main_target: .base == "main";
  def queued: .q == true;
  def hard_gated: labels | any(. == "needs-human" or . == "hold" or . == "gated" or . == "queue-deferred");
  [
    "  CLEAN: " + ([.[] | select(main_target and queued and (.ms // "") == "CLEAN")] | length | tostring),
    "  UNSTABLE: " + ([.[] | select(main_target and queued and (.ms // "") == "UNSTABLE")] | length | tostring),
    "  BLOCKED: " + ([.[] | select(main_target and queued and (.ms // "") == "BLOCKED")] | length | tostring),
    "  DIRTY: " + ([.[] | select(main_target and queued and (.ms // "") == "DIRTY")] | length | tostring),
    "  hard-gated: " + ([.[] | select(main_target and hard_gated)] | length | tostring),
    "  non-main: " + ([.[] | select(main_target | not)] | length | tostring)
  ] | .[]'

# --- DEQUEUE: hard-gated PRs must not occupy queue slots ---
echo "=== DEQUEUE (hard gates → queue removal) ==="
while read -r pr; do
    n=$(jq -r '.n' <<<"$pr"); t=$(jq -r '.t' <<<"$pr")
    echo "  #$n  $t"
    if ! dequeue_strict "$n"; then
      echo "::error::Failed to prove held PR #$n is outside merge queue" >&2
      exit 1
    fi
done < <(echo "$SNAP" | jq -c '.[]
  | select(.q == true)
  | select(.draft or ([.L[]] | any(. == "needs-human" or . == "hold" or . == "gated" or . == "queue-deferred")))')

# A production-red exception is intentionally WIP 1. Keep at most one queued
# PR whose exact base/head/full diff still satisfies the semantic classifier;
# remove every ordinary PR from the native queue without changing its source,
# labels, ready state, or auto-merge intent. Draft-only/blocked modes retain no
# queued PRs. This is the existing queue controller applying one narrower
# admission policy, not a parallel queue.
if [[ "$DRAIN_PROMOTION_MODE" == "isolated-only" || "$DRAIN_FREEZE_EXISTING_QUEUE" == "1" ]]; then
  echo "=== DEQUEUE (fleet promotion constraint → queue removal) ==="
  ISOLATED_KEEP_PR=""
  if [[ "$DRAIN_PROMOTION_MODE" == "isolated-only" ]]; then
    ISOLATED_KEEP_PR="$(echo "$SNAP" | jq -r '
      [ .[]
        | select(.q == true and .iso == true)
        | select(.draft | not)
        | select(.m == "MERGEABLE")
        | select(.fail | length == 0)
        | select(([.L[]] | any(. == "needs-human" or . == "hold" or . == "gated" or . == "queue-deferred")) | not)
        | .n ] | sort | first // empty')"
    [[ -n "$ISOLATED_KEEP_PR" ]] && echo "  preserving exact isolated PR #$ISOLATED_KEEP_PR (WIP 1)"
  fi
  while read -r pr; do
    n=$(jq -r '.n' <<<"$pr"); t=$(jq -r '.t' <<<"$pr")
    if [[ -n "$ISOLATED_KEEP_PR" && "$n" == "$ISOLATED_KEEP_PR" ]]; then
      continue
    fi
    echo "  #$n  $t  ⏸ $DRAIN_PROMOTION_MODE"
    head_oid="$(jq -r '.headOid // ""' <<<"$pr")"
    if ! record_fleet_hold "$n" "$head_oid"; then
      echo "::error::Failed to record exact-head recovery intent for fleet-held PR #$n" >&2
      # Safety outranks automatic recovery: stop the queued change even when
      # durable hold evidence could not be written, then surface the incident.
      dequeue_strict "$n" || true
      exit 1
    fi
    if ! dequeue_strict "$n"; then
      echo "::error::Failed to prove fleet-held PR #$n is outside merge queue" >&2
      exit 1
    fi
    if [[ "$DRY_RUN" != "1" ]]; then
      current_head="$(gh_retry pr view "$n" -R "$REPO" --json headRefOid --jq '.headRefOid // ""' 2>/dev/null || true)"
      current_head="$(printf '%s' "$current_head" | tr '[:upper:]' '[:lower:]')"
      if [[ "$current_head" =~ ^[0-9a-f]{40}$ && "$current_head" != "$head_oid" ]]; then
        if ! record_fleet_hold "$n" "$current_head"; then
          echo "::error::PR #$n changed head during fleet dequeue and recovery intent could not follow it" >&2
          exit 1
        fi
      fi
    fi
  done < <(echo "$SNAP" | jq -c '.[]
    | select(.q == true)
    | select(.draft | not)
    | select(([.L[]] | any(. == "needs-human" or . == "hold" or . == "gated" or . == "queue-deferred")) | not)')
fi

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
echo "=== DEQUEUE (conflict / failing → queue removal) ==="
echo "$SNAP" | jq -c --arg promotion_mode "$DRAIN_PROMOTION_MODE" --arg freeze "$DRAIN_FREEZE_EXISTING_QUEUE" '.[]
  | select($promotion_mode == "normal" or $promotion_mode == "hold-intake" or ($promotion_mode == "blocked" and $freeze == "0"))
  | select(.q == true)
  | select(([.L[]] | any(.=="needs-human" or .=="hold" or .=="gated" or .=="queue-deferred")) | not)
  | select(
      ([.L[]] | any(.=="needs-conflict-resolution"))
      or (.m == "CONFLICTING")
      or (
        (.fail|length>0)
        and (
          $promotion_mode != "hold-intake"
          or ((.fail | index("required check status unavailable")) == null)
        )
      )
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
      if ! dequeue_strict "$n"; then
        echo "::error::Failed to prove PR #$n is outside native merge queue" >&2
        exit 1
      fi
    else
      unlabel "$n" merge-queue
    fi
  done

# --- DEQUEUE: non-progressing front items (JOV-5030) ---
# A front PR whose unchanged head has a classified or repeated merge-group
# failure is non-progressing; while it occupies
# the queue every follower is grouped behind it and pays duplicate full CI.
# GitHub ejects it after the failed attempt; this pass removes it again if
# anything re-added the unchanged head, and the ENROLL guard below refuses to
# re-admit it. Action 'unknown' (missing evidence) never dequeues. Fleet
# promotion modes are excluded: those passes above already hold the queue.
if [[ "$DRAIN_PROMOTION_MODE" == "normal" || ( "$DRAIN_PROMOTION_MODE" == "blocked" && "$DRAIN_FREEZE_EXISTING_QUEUE" == "0" ) ]]; then
  echo "=== DEQUEUE (non-progressing front → queue removal) ==="
  while read -r pr; do
    n=$(jq -r '.n' <<<"$pr"); t=$(jq -r '.t' <<<"$pr")
    head_oid="$(jq -r '.headOid // ""' <<<"$pr")"
    [[ "$head_oid" =~ ^[0-9a-f]{40}$ ]] || continue
    churn_action="$(front_churn_action "$n" "$head_oid")"
    if [[ "$churn_action" == "block" ]]; then
      echo "  #$n  $t  ✗ unchanged head has a classified/repeated merge-group failure"
      if ! dequeue_strict "$n"; then
        echo "::error::Failed to prove non-progressing front PR #$n is outside native merge queue" >&2
        exit 1
      fi
    fi
  done < <(echo "$SNAP" | jq -c '.[]
    | select(.q == true)
    | select(.base == "main")
    | select(.draft | not)
    | select(([.L[]] | any(.=="needs-human" or .=="hold" or .=="gated" or .=="queue-deferred")) | not)')
fi

# --- ENROLL: non-draft, mergeable, no FAILING checks, not opted-out, not queued ---
# Enroll on mergeable + no actually-failing checks. We deliberately do NOT require
# mergeStateStatus==CLEAN: zombie cancelled/queued required-check runs (from
# cancel-in-progress) pin otherwise-green PRs at BLOCKED, and gating enrollment on
# CLEAN meant those PRs never entered the queue. Enrolling a not-yet-green PR is
# safe — the backend re-validates and the dequeue step above removes any that truly
# fail. `.fail` only counts terminal failing checks, not pending/queued ones.
echo "=== ENROLL (mergeable + not failing → queue admission) ==="
# Honor the checked-in queue policy's maxQueueDepth. Use process substitution rather
# than a pipe so ENROLLED_THIS_RUN remains in the parent shell and the cap is
# actually enforced.
MAX_QUEUE_DEPTH=$(node scripts/ci-merge-queue-check.mjs max-queue-depth 2>/dev/null || echo 16)
if [[ "$DRAIN_PROMOTION_MODE" == "normal" ]]; then
  QUEUED_NOW=$(echo "$SNAP" | jq '[.[] | select(.q == true)] | length')
  ENROLL_SLOTS=$((MAX_QUEUE_DEPTH - QUEUED_NOW))
elif [[ "$DRAIN_PROMOTION_MODE" == "isolated-only" ]]; then
  MAX_QUEUE_DEPTH=1
  QUEUED_NOW=$([[ -n "${ISOLATED_KEEP_PR:-}" ]] && echo 1 || echo 0)
  ENROLL_SLOTS=$((MAX_QUEUE_DEPTH - QUEUED_NOW))
elif [[ "$DRAIN_PROMOTION_MODE" == "hold-intake" ]]; then
  QUEUED_NOW=$(echo "$SNAP" | jq '[.[] | select(.q == true)] | length')
  REPAIR_QUEUED=$(echo "$SNAP" | jq '[.[] | select(.q == true and .unboundRepair == true)] | length')
  if [[ "$REPAIR_QUEUED" -eq 0 && "$QUEUED_NOW" -lt "$MAX_QUEUE_DEPTH" ]]; then
    ENROLL_SLOTS=1
  else
    ENROLL_SLOTS=0
  fi
elif [[ "$DRAIN_FREEZE_EXISTING_QUEUE" == "1" ]]; then
  MAX_QUEUE_DEPTH=0
  QUEUED_NOW=0
  ENROLL_SLOTS=0
else
  QUEUED_NOW=$(echo "$SNAP" | jq '[.[] | select(.q == true)] | length')
  ENROLL_SLOTS=0
fi
[[ "$ENROLL_SLOTS" -lt 0 ]] && ENROLL_SLOTS=0
echo "  queue depth: $QUEUED_NOW/$MAX_QUEUE_DEPTH ($ENROLL_SLOTS slots)"
if [[ -z "$DRAIN_ADMISSION_PR" ]]; then
  echo "  admission scope: maintenance-only (no new enrollment)"
else
  echo "  admission scope: #$DRAIN_ADMISSION_PR at $DRAIN_ADMISSION_HEAD"
fi

# A clean PR whose CI completed while the exact-main production binding was
# unavailable cannot enter the queue unless it is the single attested repair.
# Preserve that *event-scoped exact head* as a pending fleet receipt before
# declining admission. A later successful Production Controller event may use
# only this receipt as a selector; it still re-runs every current eligibility,
# source-gate, native-queue, and postcondition check before enrollment. Without
# the receipt, the CI event is lost once production recovers and an operator
# has to redispatch the exact PR manually.
if [[ "$DRAIN_PROMOTION_MODE" == "hold-intake" && -n "$DRAIN_ADMISSION_PR" ]]; then
  while read -r pr; do
    n="$(jq -r '.n' <<<"$pr")"
    head_oid="$(jq -r '.headOid // ""' <<<"$pr" | tr '[:upper:]' '[:lower:]')"
    echo "=== DEFER (production-unbound exact-head recovery receipt) ==="
    echo "  #$n  $(jq -r '.t' <<<"$pr")  ⏸ hold-intake"
    if ! record_fleet_hold "$n" "$head_oid"; then
      echo "::error::Failed to record exact-head recovery receipt for deferred PR #$n" >&2
      exit 1
    fi
  done < <(echo "$SNAP" | jq -c --arg admission_pr "$DRAIN_ADMISSION_PR" --arg admission_head "$DRAIN_ADMISSION_HEAD" '.[]
    | select((.n | tostring) == $admission_pr)
    | select((.headOid // "") | ascii_downcase == $admission_head)
    | select(.q | not)
    | select(.unboundRepair | not)
    | select(.draft | not)
    | select(.m == "MERGEABLE")
    | select(.base == "main")
    | select(.fail | length == 0)
    | select([.L[]] | any(. == "needs-human" or . == "hold" or . == "gated" or . == "queue-deferred" or . == "needs-conflict-resolution" or . == "fast") | not)')
fi
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
    if [[ "$DRAIN_PROMOTION_MODE" == "normal" && "$DRY_RUN" != "1" ]]; then
      enrolled_head="$(jq -r '.headOid // ""' <<<"$pr")"
      if fleet_hold_is_recoverable "$enrolled_head"; then
        clear_fleet_hold "$n" "$enrolled_head" || true
      fi
    fi
  else
    enroll_result=$?
    ENROLLED_THIS_RUN=$((ENROLLED_THIS_RUN - 1))
    if [[ "$enroll_result" -eq 2 ]]; then
      continue
    fi
    echo "::error::Failed to prove enrollment for #$n" >&2
    exit 1
  fi
done < <(echo "$SNAP" | jq -c --arg admission_pr "$DRAIN_ADMISSION_PR" --arg promotion_mode "$DRAIN_PROMOTION_MODE" '.[]
  | select(
      $promotion_mode == "normal"
      or ($promotion_mode == "isolated-only" and .iso == true)
      or ($promotion_mode == "hold-intake" and .unboundRepair == true)
    )
  | select((.n | tostring) == $admission_pr)
  | select(.draft|not)
  | select(.m=="MERGEABLE")
  | select(.base=="main")
  | select(.fail|length==0)
  | select(.q | not)
  | select([.L[]] | any(.=="needs-human" or .=="hold" or .=="gated" or .=="queue-deferred" or .=="needs-conflict-resolution" or .=="fast") | not)')

# A scoped CI-completion event that reaches this point without an exact-head
# native queue receipt is not a successful controller pass. Previously this
# returned success and left the PR invisible until an unrelated event happened.
# Fail with a classified machine-owned condition so Delivery Control Receipts
# emits a durable Gem repair task; it still cannot merge or bypass any gate.
if [[ -n "$DRAIN_ADMISSION_PR" && "$ENROLLED_THIS_RUN" -eq 0 ]]; then
  ADMISSION_TARGET_OBSERVED="$(echo "$SNAP" | jq -r \
    --arg admission_pr "$DRAIN_ADMISSION_PR" \
    --arg admission_head "$DRAIN_ADMISSION_HEAD" '
      any(.[];
        ((.n | tostring) == $admission_pr)
        and ((.headOid // "") | ascii_downcase == $admission_head)
      )
    ')"
  ADMISSION_ALREADY_QUEUED="$(echo "$SNAP" | jq -r \
    --arg admission_pr "$DRAIN_ADMISSION_PR" \
    --arg admission_head "$DRAIN_ADMISSION_HEAD" '
      any(.[];
        ((.n | tostring) == $admission_pr)
        and ((.headOid // "") | ascii_downcase == $admission_head)
        and (.q == true)
      )
    ')"
  # A changed head has invalidated the event scope. It must never inherit this
  # event's queue intent; the newer head's own event creates its receipt.
if [[ "$DRY_RUN" != "1" && "$ADMISSION_TARGET_OBSERVED" == "true" && "$ADMISSION_ALREADY_QUEUED" != "true" ]]; then
    echo "::error::queue-noop: exact admission #$DRAIN_ADMISSION_PR at $DRAIN_ADMISSION_HEAD has no native queue receipt" >&2
    exit 3
  fi
fi

# A completed merge_group CI run is not attributable to an individual source
# PR: GitHub reports its synthetic composite SHA. If it completes after main
# moved, GitHub can leave previously admitted members unqueued with no future
# PR-head event to re-trigger admission. Reconcile only a tiny, exact-head
# cohort which this controller itself recorded after a prior native admission.
# This is not a clean-backlog sweep: no receipt, changed head, red source gate,
# hard hold, or non-normal fleet policy is a no-op. The cap protects the queue
# from one composite event fanning out into a full cohort rebuild.
if [[ "$DRAIN_RECONCILE_QUEUE_REENTRY" == "1" ]]; then
  echo "=== RECOVER (bounded exact-head native re-entry after composite CI) ==="
  REENTRY_RECOVERED=0
  while read -r pr; do
    stop_if_budget_exhausted && break
    if [[ "$REENTRY_RECOVERED" -ge "$DRAIN_QUEUE_REENTRY_MAX_PER_RUN" ]]; then
      echo "  ~ reached exact re-entry cap ($DRAIN_QUEUE_REENTRY_MAX_PER_RUN)"
      break
    fi
    if [[ "$ENROLLED_THIS_RUN" -ge "$ENROLL_SLOTS" ]]; then
      echo "  ~ queue depth cap reached before re-entry recovery"
      break
    fi
    n="$(jq -r '.n' <<<"$pr")"
    t="$(jq -r '.t' <<<"$pr")"
    head_oid="$(jq -r '.headOid // ""' <<<"$pr" | tr '[:upper:]' '[:lower:]')"
    if ! queue_reentry_receipt_is_recoverable "$head_oid"; then
      continue
    fi
    # The snapshot's check result can be stale. This is an exact-current-head
    # gate, independently re-read immediately before the native enrollment.
    fresh_failures="$(check_failures_for_pr "$n")"
    if [[ "$(jq 'length' <<<"$fresh_failures")" -ne 0 ]]; then
      echo "  #$n  $t  ⏸ current exact-head checks are not green"
      continue
    fi
    echo "  #$n  $t  ↻ exact native re-entry at $head_oid"
    if enroll_if_still_eligible "$n" "$n" "$head_oid"; then
      REENTRY_RECOVERED=$((REENTRY_RECOVERED + 1))
      ENROLLED_THIS_RUN=$((ENROLLED_THIS_RUN + 1))
    else
      reentry_result=$?
      if [[ "$reentry_result" -ne 2 ]]; then
        echo "::error::Failed exact native re-entry recovery for #$n" >&2
        exit 1
      fi
    fi
  done < <(echo "$SNAP" | jq -c '[ .[]
    | select(.q | not)
    | select(.draft | not)
    | select(.m == "MERGEABLE")
    | select(.base == "main")
    | select(.fail | length == 0)
    | select([.L[]] | any(. == "needs-human" or . == "hold" or . == "gated" or . == "queue-deferred" or . == "needs-conflict-resolution" or . == "fast") | not)
    | select((.headOid // "") | test("^[0-9a-f]{40}$"))
    | {n, t, headOid}
  ] | sort_by(.n)[]')
fi

# A completed Production Controller event is the only global recovery signal.
# Exact pending status receipts were written before fleet-driven dequeue, are
# bound to immutable heads, and are selectors rather than admission authority:
# every PR still passes fresh metadata, required-check, native-preflight, and
# postcondition validation. Main pushes and untargeted manual runs remain
# maintenance-only and cannot consume these receipts.
if [[ "$DRAIN_RECOVER_FLEET_HOLDS" == "1" ]]; then
  echo "=== RECOVER (exact fleet-held heads after production recovery) ==="
  while read -r pr; do
    stop_if_budget_exhausted && break
    n="$(jq -r '.n' <<<"$pr")"
    t="$(jq -r '.t' <<<"$pr")"
    head_oid="$(jq -r '.headOid // ""' <<<"$pr")"
    if [[ "$ENROLLED_THIS_RUN" -ge "$ENROLL_SLOTS" ]]; then
      echo "  #$n  $t  ⏸ deferred (queue at depth cap)"
      continue
    fi
    if ! fleet_hold_is_recoverable "$head_oid"; then
      continue
    fi
    echo "  #$n  $t  ↻ exact fleet recovery at $head_oid"
    if enroll_if_still_eligible "$n" "$n" "$head_oid"; then
      ENROLLED_THIS_RUN=$((ENROLLED_THIS_RUN + 1))
      if ! clear_fleet_hold "$n" "$head_oid"; then
        echo "::error::Fleet-held PR #$n was enrolled but its recovery receipt did not close" >&2
        exit 1
      fi
    else
      recovery_result=$?
      if [[ "$recovery_result" -ne 2 ]]; then
        echo "::error::Failed exact fleet-hold recovery for #$n" >&2
        exit 1
      fi
    fi
  done < <(echo "$SNAP" | jq -c '.[]
    | select(.q | not)
    | select(.draft | not)
    | select(.m == "MERGEABLE")
    | select(.base == "main")
    | select(.fail | length == 0)
    | select([.L[]] | any(. == "needs-human" or . == "hold" or . == "gated" or . == "queue-deferred" or . == "needs-conflict-resolution" or . == "fast") | not)')
fi

# --- CONFLICT: needs rebase (agent branches only) → label + hand to fix agent ---
echo "=== CONFLICT (needs rebase → fix agent) ==="
echo "$SNAP" | jq -r --arg re "$AGENT_RE" '.[]
  | select(.m=="CONFLICTING")
  | select(.base=="main")
  | select(.head|test($re))
  | select([.L[]] | any(.=="needs-human" or .=="hold" or .=="gated" or .=="queue-deferred") | not)
  | "  #\(.n)  \(.t)  [\(.head)]"'
echo "$SNAP" | jq -r --arg re "$AGENT_RE" '.[]
  | select(.m=="CONFLICTING")
  | select(.base=="main")
  | select(.head|test($re))
  | select([.L[]] | any(.=="needs-human" or .=="hold" or .=="gated" or .=="queue-deferred") | not) | .n' \
| while read -r n; do [[ -n "$n" ]] && label "$n" needs-conflict-resolution; done

# --- BLOCKED: mergeable but red checks → hand to fix agent ---
echo "=== BLOCKED (red checks → fix agent) ==="
echo "$SNAP" | jq -r '.[]
  | select(.draft|not) | select(.m=="MERGEABLE") | select(.fail|length>0)
  | select(.base=="main")
  | select([.L[]] | any(.=="needs-human" or .=="hold" or .=="gated" or .=="queue-deferred") | not)
  | "  #\(.n)  \(.t)  ✗ \(.fail|join(", "))"'

# --- SURFACE: human-gated / superseded → report only, never auto-close ---
echo "=== SURFACE (human decision; not touched) ==="
echo "$SNAP" | jq -r '.[]
  | select(.draft or ([.L[]] | any(.=="needs-human" or .=="hold" or .=="gated" or .=="queue-deferred")))
  | "  #\(.n)  \(.t)  {\(.L|join(","))}"'

echo "=== done (DRY_RUN=$DRY_RUN) ==="
