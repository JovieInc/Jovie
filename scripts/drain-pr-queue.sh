#!/usr/bin/env bash
# GitHub-native PR queue drain. Native enrollment uses exact-head admission and
# authoritative queue state without reading, writing, or requiring a transport
# label. A label-backed fixture exists only for isolated shell tests.
# Autonomous shipping (2026-07-06): taste and human labels are advisory.
# Durable mechanical holds are queue-deferred and the no-auto tombstone family.
# needs-human / hold / gated do not skip enrollment. Conflicts are repaired.
# JOV-INV-023: retarget every PR onto main; do not freeze on observation gaps.
#
# It deliberately does NOT:
#   - directly merge a PR (native enrollment uses `gh pr merge --auto`; the
#     queue still owns integration validation and the eventual merge)
#   - retarget to integration/loop-* (agents ship straight to main now)
#   - close ordinary PRs (drafts and queue-deferred are reported, not closed)
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
#   DRAIN_MERGEABLE_RECHECK_ATTEMPTS / DRAIN_MERGEABLE_RECHECK_SECONDS
#     bounded live reread for GitHub's transient UNKNOWN mergeability window
#     immediately before exact-head enrollment (defaults 6 / 2)
#   DRAIN_ADMISSION_PR / DRAIN_ADMISSION_HEAD  optional exact new-admission
#     scope; when both are empty this run is maintenance-only
#   GH_INVENTORY_RETRY_ATTEMPTS / GH_INVENTORY_RETRY_MAX_DELAY  cap the
#     oversized fleet-read class (default 3 / 15). Do not reuse mutation
#     GH_RETRY_ATTEMPTS=8 on SNAP / list-state.
#   DRAIN_RECONCILE_MISSED_ADMISSION  permit bounded exact-green recovery
#     pass for admission events replaced while pending in the workflow mutex
#   DRAIN_QUEUE_REENTRY_MAX_PER_RUN  total event + recovery admission cap (1-2)
#   DRAIN_PROMOTION_MODE  normal, isolated-only, draft-only, hold-intake, or blocked
#   DRAIN_FLEET_GATE_B64  bounded admission projection; required outside normal
#   DRAIN_RECOVER_FLEET_HOLDS  exact production-controller recovery event only
#   FLEET_HOLD_TTL_SECONDS  pending jovie-fleet-queue-hold/v1 deadline (default 720)
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
  if [[ "${DRAIN_MUTATION_AUTHORIZATION:-}" == "merge-queue-autoenroll" \
    && -z "${GH_MUTATION_TOKEN:-}" ]]; then
    echo "::error::Refusing live drain without GH_MUTATION_TOKEN" >&2
    exit 2
  fi
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

# Read the fleet with the workflow-scoped token and reserve the GitHub App
# installation token for commands that actually mutate repository state. The
# subshell keeps the read identity authoritative for every subsequent call.
gh_mutate_retry() {
  local mutation_token="${GH_MUTATION_TOKEN:-}"
  if [[ -z "$mutation_token" && "${DRAIN_MUTATION_AUTHORIZATION:-}" == "test-fixture" ]]; then
    mutation_token="${GH_TOKEN:-test-fixture-token}"
  fi
  if [[ -z "$mutation_token" ]]; then
    echo "::error::GitHub mutation refused without GH_MUTATION_TOKEN" >&2
    return 2
  fi
  (
    export GH_TOKEN="$mutation_token"
    gh_retry "$@"
  )
}

# Inventory-class GitHub reads (SNAP / list-state). Cap this class so a
# 502/504/timeout on an oversized fleet query cannot retry eight times and
# starve the enrollment mutation.
gh_inventory_retry() {
  GH_RETRY_ATTEMPTS="${GH_INVENTORY_RETRY_ATTEMPTS:-3}" \
  GH_RETRY_MAX_DELAY="${GH_INVENTORY_RETRY_MAX_DELAY:-15}" \
    gh_retry "$@"
}

native_state_to_snap() {
  jq -c '
    [ to_entries[] | .key as $k | .value | {
      n: (.number // (try ($k | tonumber) catch empty) // null),
      t: ((.title // "")[0:48]),
      draft: (.isDraft == true),
      m: .mergeable,
      ms: (.mergeStateStatus // "UNKNOWN"),
      head: .headRefName,
      headOid: ((.headRefOid // "") | ascii_downcase),
      base: (.baseRefName // "main"),
      body: (.body // ""),
      L: [((.labels.nodes // [])[] | .name)],
      fail: [],
      q: (.queued == true),
      qs: (.mergeQueueEntry.state // null),
      oid: .headRefOid
    } | select(.n | type == "number") ]
  '
}

inventory_native_queue_state() {
  local attempts="${GH_INVENTORY_RETRY_ATTEMPTS:-3}"
  local base_delay="${GH_RETRY_BASE_DELAY:-2}"
  local max_delay="${GH_INVENTORY_RETRY_MAX_DELAY:-15}"
  local attempt=1
  local out_file err_file err delay
  out_file="$(mktemp)"
  err_file="$(mktemp)"
  # shellcheck disable=SC2064
  trap "rm -f '$out_file' '$err_file'" RETURN
  while [[ "$attempt" -le "$attempts" ]]; do
    if node scripts/merge-queue-backend.mjs list-state "$@" >"$out_file" 2>"$err_file"; then
      cat "$out_file"
      return 0
    fi
    err="$(<"$err_file")"
    if [[ "$attempt" -eq "$attempts" ]] || ! gh_retry_is_transient_error "$err"; then
      echo "$err" >&2
      return 1
    fi
    delay=$((base_delay * (2 ** (attempt - 1))))
    [[ "$delay" -gt "$max_delay" ]] && delay="$max_delay"
    echo "  [gh-retry] list-state attempt $attempt/$attempts failed (transient); retrying in ${delay}s…" >&2
    sleep "$delay"
    attempt=$((attempt + 1))
  done
  return 1
}

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
DRAIN_MERGEABLE_RECHECK_ATTEMPTS="${DRAIN_MERGEABLE_RECHECK_ATTEMPTS:-6}"
DRAIN_MERGEABLE_RECHECK_SECONDS="${DRAIN_MERGEABLE_RECHECK_SECONDS:-2}"
if [[ ! "$DRAIN_ISOLATION_EVAL_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]] \
  || (( DRAIN_ISOLATION_EVAL_TIMEOUT_SECONDS > DRAIN_MAX_SECONDS )); then
  echo "::error::DRAIN_ISOLATION_EVAL_TIMEOUT_SECONDS must be positive and no larger than DRAIN_MAX_SECONDS" >&2
  exit 2
fi
if [[ ! "$DRAIN_MERGEABLE_RECHECK_ATTEMPTS" =~ ^[1-9][0-9]*$ ]] \
  || (( DRAIN_MERGEABLE_RECHECK_ATTEMPTS > 10 )) \
  || [[ ! "$DRAIN_MERGEABLE_RECHECK_SECONDS" =~ ^[0-9]+$ ]] \
  || (( DRAIN_MERGEABLE_RECHECK_SECONDS > 30 )); then
  echo "::error::DRAIN_MERGEABLE_RECHECK_ATTEMPTS must be 1-10 and DRAIN_MERGEABLE_RECHECK_SECONDS must be 0-30" >&2
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
FLEET_HOLD_APP_USER="jovie-bot[bot]"
FLEET_HOLD_WORKFLOW_NAME="Merge Queue Auto-Enroll"
FLEET_HOLD_WORKFLOW_PATH=".github/workflows/merge-queue-autoenroll.yml"
# Pending fleet holds are a recovery selector, never an unbounded required
# check. Waiting lanes (hold-intake / draft-only / main-not-green) must close
# them on the next controller pass. Isolated-only holds expire at this TTL.
FLEET_HOLD_TTL_SECONDS="${FLEET_HOLD_TTL_SECONDS:-720}"
# A successful native enrollment leaves a bot-authored, exact-head receipt.
# A completed CI merge_group has no source PR head to admit, but it is the
# authoritative signal that GitHub may just have ejected unmerged cohort
# members while main advanced. Separately, GitHub may replace an older pending
# admission run in this workflow's one mutex. A surviving pass may recover a
# tiny exact-green cohort without requiring a prior receipt; both recovery
# sources share one cap and the same exact-head enrollment gate.
DRAIN_RECONCILE_QUEUE_REENTRY="${DRAIN_RECONCILE_QUEUE_REENTRY:-0}"
DRAIN_RECONCILE_MISSED_ADMISSION="${DRAIN_RECONCILE_MISSED_ADMISSION:-0}"
DRAIN_QUEUE_REENTRY_MAX_PER_RUN="${DRAIN_QUEUE_REENTRY_MAX_PER_RUN:-2}"
QUEUE_REENTRY_CONTEXT="jovie-queue-reentry/v1"
UNMERGEABLE_EJECT_CONTEXT="jovie-native-unmergeable/v1"
PRODUCT_FAILURE_CONTEXT="jovie-queue-product-failure/v1"
PRODUCT_FAILURE_DESCRIPTION="blocked:merge-group-product-failure"
LAST_ENROLL_SKIP_REASON=""
# JOV-5276: no-auto* is a durable tombstone. Unlike queue-deferred, this
# controller never strips these labels, including hold-intake missed-admission
# recovery. Splice into every eligibility, dequeue, re-entry, and postcondition
# jq predicate.
NO_AUTO_HOLD_JQ='. == "no-auto" or . == "no-auto-merge" or . == "no-automerge"'
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
      const value = process.env.DRAIN_FLEET_GATE_B64 || "";
      const receipt = JSON.parse(Buffer.from(value, "base64").toString("utf8"));
      const observed = Date.parse(receipt.observedAt || "");
      const now = Date.now();
      if (!Number.isFinite(observed) || observed > now + 60_000 || now - observed > 600_000) {
        throw new Error("stale fleet receipt");
      }
      process.stdout.write(JSON.stringify(receipt));
    ' 2>/dev/null)"; then
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
        .closureAdmission.authority == "Summer" and
        (.closureAdmission.status | IN("healthy", "grace", "red")) and
        (.closureAdmission.newIssueIntakeAllowed | type == "boolean") and
        .closureAdmission.newIssueIntakeAllowed == (.closureAdmission.status == "healthy") and
        .closureAdmission.allowed == .closureAdmission.newIssueIntakeAllowed and
        .closureAdmission.newImplementationAllowed == .closureAdmission.newIssueIntakeAllowed and
        .closureAdmission.fallbackPrGenerationAllowed == .closureAdmission.newIssueIntakeAllowed and
        .closureAdmission.promotionContinues == true and
        .closureAdmission.remediationContinues == true and
        .alreadyAdmittedCohort.newIntakeAllowed == .closureAdmission.newIssueIntakeAllowed
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
if [[ ! "$FLEET_HOLD_TTL_SECONDS" =~ ^[1-9][0-9]*$ ]] \
  || (( FLEET_HOLD_TTL_SECONDS > 3600 )); then
  echo "::error::FLEET_HOLD_TTL_SECONDS must be an integer from 1 through 3600" >&2
  exit 2
fi
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
if [[ "$DRAIN_RECONCILE_MISSED_ADMISSION" != "0" && "$DRAIN_RECONCILE_MISSED_ADMISSION" != "1" ]]; then
  echo "::error::DRAIN_RECONCILE_MISSED_ADMISSION must be 0 or 1" >&2
  exit 2
fi
if [[ "$DRAIN_RECONCILE_MISSED_ADMISSION" == "1" ]]; then
  case "$DRAIN_PROMOTION_MODE" in
    normal | hold-intake | draft-only) ;;
    *)
      echo "::error::Missed admission recovery requires a clean-admitting fleet mode" >&2
      exit 2
      ;;
  esac
fi
if [[ ! "$DRAIN_QUEUE_REENTRY_MAX_PER_RUN" =~ ^[1-9][0-9]*$ ]] \
  || (( DRAIN_QUEUE_REENTRY_MAX_PER_RUN > 2 )); then
  echo "::error::DRAIN_QUEUE_REENTRY_MAX_PER_RUN must be an integer from 1 through 2" >&2
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
  gh_mutate_retry pr edit "$1" -R "$REPO" --add-label "$2" >/dev/null 2>&1 \
    && echo "    +$2 on #$1" || echo "    !! failed to add $2 on #$1"
}

unlabel() {  # unlabel <num> <label>
  [[ "$DRY_RUN" == "1" ]] && { echo "    [dry-run] would -$2 on #$1"; return 0; }
  gh_mutate_retry pr edit "$1" -R "$REPO" --remove-label "$2" >/dev/null 2>&1 \
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

waiting_lane_allows_clean_enroll() {
  case "$DRAIN_PROMOTION_MODE" in
    normal | hold-intake | draft-only) return 0 ;;
    *) return 1 ;;
  esac
}

fleet_hold_expires_at() {
  node -e '
    const ttl = Number(process.argv[1]);
    if (!Number.isFinite(ttl) || ttl <= 0) process.exit(2);
    process.stdout.write(new Date(Date.now() + ttl * 1000).toISOString().replace(".000Z", "Z"));
  ' "$FLEET_HOLD_TTL_SECONDS"
}

# Combined commit-status payloads often return creator:null even when the
# matching plural status is jovie-bot[bot]. Trust that production shape only
# through this fail-closed proof: expected bot avatar/status URL plus the
# exact trusted Auto-Enroll workflow run, repository, workflow path, and head
# SHA. Never accept context, state, or description alone.
null_creator_receipt_has_provenance() {  # <head> <status-json>
  local head="$1" status="$2" run_id target_url status_url
  local app_identity app_avatar run
  [[ "$head" =~ ^[0-9a-f]{40}$ ]] || return 1
  if ! run_id="$(jq -er --arg repo "$REPO" '
    .target_url
    | capture("^https://github\\.com/" + ($repo | gsub("/"; "\\/")) + "/actions/runs/(?<id>[1-9][0-9]*)$")
    | .id
  ' <<<"$status" 2>/dev/null)"; then
    return 1
  fi
  target_url="https://github.com/$REPO/actions/runs/$run_id"
  status_url="${GITHUB_API_URL:-https://api.github.com}/repos/$REPO/statuses/$head"
  if ! app_identity="$(gh_retry api "users/jovie-bot%5Bbot%5D" 2>/dev/null)" \
    || ! app_avatar="$(jq -er --arg login "$FLEET_HOLD_APP_USER" '
      select(.login == $login and .type == "Bot") | .avatar_url
    ' <<<"$app_identity" 2>/dev/null)"; then
    return 1
  fi
  if ! jq -e --arg avatar "$app_avatar" --arg status_url "$status_url" '
    .creator == null and
    .avatar_url == $avatar and
    .url == $status_url
  ' <<<"$status" >/dev/null; then
    return 1
  fi
  if ! run="$(gh_retry api "repos/$REPO/actions/runs/$run_id" 2>/dev/null)"; then
    return 1
  fi
  jq -e \
    --arg run_id "$run_id" \
    --arg repo "$REPO" \
    --arg head "$head" \
    --arg target_url "$target_url" \
    --arg workflow_name "$FLEET_HOLD_WORKFLOW_NAME" \
    --arg workflow_path "$FLEET_HOLD_WORKFLOW_PATH" '
      (.id | tostring) == $run_id and
      .name == $workflow_name and
      .path == $workflow_path and
      .html_url == $target_url and
      .repository.full_name == $repo and
      .head_repository.full_name == $repo and
      .head_sha == $head and
      (.workflow_id | type == "number") and
      (.run_attempt | type == "number" and . >= 1)
    ' <<<"$run" >/dev/null
}

receipt_actor_is_trusted() {  # <head> <status-json>
  local head="$1" status="$2"
  if jq -e '.creator.type == "Bot"' <<<"$status" >/dev/null; then
    return 0
  fi
  null_creator_receipt_has_provenance "$head" "$status"
}

fleet_hold_latest() {  # fleet_hold_latest <head> → latest status JSON or empty
  local head="$1" statuses latest
  [[ "$head" =~ ^[0-9a-f]{40}$ ]] || return 1
  if ! statuses="$(gh_retry api "repos/$REPO/commits/$head/status" 2>/dev/null)"; then
    return 1
  fi
  if ! latest="$(jq -c --arg context "$FLEET_HOLD_CONTEXT" --arg repo "$REPO" '
    [ .statuses[]? | select(.context == $context) ]
    | sort_by(.updated_at)
    | last
    | select(. != null)
    | select(.target_url | test("^https://github\\.com/" + ($repo | gsub("/"; "\\/")) + "/actions/runs/[1-9][0-9]*$"))
  ' <<<"$statuses" 2>/dev/null)"; then
    return 1
  fi
  if receipt_actor_is_trusted "$head" "$latest"; then
    printf '%s\n' "$latest"
    return 0
  fi
  return 1
}

fleet_hold_is_expired() {  # fleet_hold_is_expired <updated_at>
  local updated_at="$1"
  node -e '
    const updated = Date.parse(process.argv[1] || "");
    const ttl = Number(process.argv[2]);
    if (!Number.isFinite(updated) || !Number.isFinite(ttl) || ttl <= 0) process.exit(2);
    process.exit(Date.now() - updated >= ttl * 1000 ? 0 : 1);
  ' "$updated_at" "$FLEET_HOLD_TTL_SECONDS"
}

write_fleet_hold_status() {  # write_fleet_hold_status <head> <state> <description>
  local head="$1" state="$2" description="$3" target_url
  if ! target_url="$(fleet_hold_target_url)"; then
    return 1
  fi
  gh_mutate_retry api -X POST "repos/$REPO/statuses/$head" \
    -f state="$state" \
    -f context="$FLEET_HOLD_CONTEXT" \
    -f description="$description" \
    -f target_url="$target_url" >/dev/null
}

record_fleet_hold() {  # record_fleet_hold <num> <expected-head>
  local n="$1" expected_head="$2" current live_head expires description
  if [[ ! "$expected_head" =~ ^[0-9a-f]{40}$ ]]; then
    echo "    !! cannot record fleet hold for #$n without an exact head" >&2
    return 1
  fi
  if ! expires="$(fleet_hold_expires_at)"; then
    echo "    !! cannot compute fleet hold deadline for #$n" >&2
    return 1
  fi
  description="Held until ${expires} (${DRAIN_PROMOTION_MODE}); next: expire/enroll"
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "    [dry-run] would record $FLEET_HOLD_CONTEXT on #$n at $expected_head until $expires"
    return 0
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
  if ! write_fleet_hold_status "$live_head" pending "$description"; then
    echo "    !! failed to record exact-head fleet hold for #$n" >&2
    return 1
  fi
  echo "    +$FLEET_HOLD_CONTEXT on #$n at $live_head until $expires"
}

fleet_hold_is_recoverable() {  # fleet_hold_is_recoverable <head>
  local latest
  latest="$(fleet_hold_latest "$1" || true)"
  [[ -n "$latest" ]] || return 1
  jq -e '.state == "pending"' <<<"$latest" >/dev/null
}

close_fleet_hold() {  # close_fleet_hold <num> <head> <state> <reason>
  local n="$1" head="$2" state="$3" reason="$4"
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "    [dry-run] would close $FLEET_HOLD_CONTEXT on #$n -> $state ($reason)"
    return 0
  fi
  if write_fleet_hold_status "$head" "$state" "$reason"; then
    echo "    -$FLEET_HOLD_CONTEXT on #$n -> $state ($reason)"
    return 0
  fi
  echo "    !! failed to close exact-head fleet hold for #$n" >&2
  return 1
}

clear_fleet_hold() {  # clear_fleet_hold <num> <head>
  if close_fleet_hold "$1" "$2" success \
    "Recovered by canonical fleet controller at exact head"; then
    return 0
  fi
  echo "    !! #$1 enrolled, but exact-head fleet hold receipt did not close" >&2
  return 1
}

# A native queue admission is durable only when a bot-authored, exact-head
# receipt survives the transient queue membership. It is deliberately a commit
# status rather than a label: labels are intent/audit only and can be mutated
# without changing the source revision. The receipt is never sufficient on its
# own; recovery still re-reads current PR state, current source checks, and the
# native queue postcondition.
queue_reentry_receipt_is_recoverable() {  # <head>
  local head="$1" statuses latest
  [[ "$head" =~ ^[0-9a-f]{40}$ ]] || return 1
  if ! statuses="$(gh_retry api "repos/$REPO/commits/$head/status" 2>/dev/null)"; then
    return 1
  fi
  latest="$(jq -c --arg context "$QUEUE_REENTRY_CONTEXT" --arg repo "$REPO" '
    [ .statuses[]? | select(.context == $context) ]
    | sort_by(.updated_at)
    | last
    | select(
        . != null
        and .state == "success"
        and (.description == "Native queue admission recorded at exact head")
        and (.target_url | test("^https://github\\.com/" + ($repo | gsub("/"; "\\/")) + "/actions/runs/[1-9][0-9]*$"))
      )
  ' <<<"$statuses" 2>/dev/null)" || true
  [[ -n "$latest" ]] || return 1
  receipt_actor_is_trusted "$head" "$latest"
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
  if ! gh_mutate_retry api -X POST "repos/$REPO/statuses/$live_head" \
    -f state=success \
    -f context="$QUEUE_REENTRY_CONTEXT" \
    -f description="Native queue admission recorded at exact head" \
    -f target_url="$target_url" >/dev/null; then
    echo "    !! failed to record exact-head queue re-entry receipt for #$n" >&2
    return 1
  fi
  echo "    +$QUEUE_REENTRY_CONTEXT on #$n at $live_head"
}

# Typed UNMERGEABLE eject receipts are success statuses so they cannot mark a
# CLEAN source PR UNSTABLE. They bind the exact head and refuse re-enrollment
# until that head moves (JOV-5291).
unmergeable_eject_receipt_head() {  # <head>
  local head="$1" statuses latest
  [[ "$head" =~ ^[0-9a-f]{40}$ ]] || return 0
  if ! statuses="$(gh_retry api "repos/$REPO/commits/$head/status" 2>/dev/null)"; then
    return 0
  fi
  latest="$(jq -c --arg context "$UNMERGEABLE_EJECT_CONTEXT" --arg repo "$REPO" '
    [ .statuses[]? | select(.context == $context) ]
    | sort_by(.updated_at)
    | last
    | select(
        . != null
        and .state == "success"
        and (.description | startswith("ejected:"))
        and (.target_url | test("^https://github\\.com/" + ($repo | gsub("/"; "\\/")) + "/actions/runs/[1-9][0-9]*$"))
      )
  ' <<<"$statuses" 2>/dev/null)" || true
  if [[ -n "$latest" ]] && receipt_actor_is_trusted "$head" "$latest"; then
    printf '%s\n' "$head"
  fi
  return 0
}

record_unmergeable_eject_receipt() {  # <pr> <expected-head> <reason>
  local n="$1" expected_head="$2" reason="$3" current live_head target_url description
  if [[ ! "$expected_head" =~ ^[0-9a-f]{40}$ ]]; then
    echo "    !! cannot record UNMERGEABLE eject for #$n without an exact head" >&2
    return 1
  fi
  if [[ ! "$reason" =~ ^[a-z0-9-]{1,40}$ ]]; then
    echo "    !! refusing untyped UNMERGEABLE eject reason for #$n" >&2
    return 1
  fi
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "    [dry-run] would record $UNMERGEABLE_EJECT_CONTEXT ejected:$reason on #$n at $expected_head"
    return 0
  fi
  if [[ "$(unmergeable_eject_receipt_head "$expected_head")" == "$expected_head" ]]; then
    echo "    =$UNMERGEABLE_EJECT_CONTEXT on #$n at $expected_head (already recorded)"
    return 0
  fi
  if ! target_url="$(fleet_hold_target_url)"; then
    echo "    !! canonical workflow run identity is missing for UNMERGEABLE eject #$n" >&2
    return 1
  fi
  if ! current="$(gh_retry pr view "$n" -R "$REPO" --json state,headRefOid 2>/dev/null)"; then
    echo "    !! could not refresh #$n before recording UNMERGEABLE eject" >&2
    return 1
  fi
  live_head="$(jq -r '(.headRefOid // "") | ascii_downcase' <<<"$current")"
  if ! jq -e --arg head "$expected_head" '
    .state == "OPEN" and ((.headRefOid // "") | ascii_downcase) == $head
  ' <<<"$current" >/dev/null; then
    echo "    ⏸ #$n head changed before UNMERGEABLE eject receipt"
    return 2
  fi
  description="ejected:${reason}"
  if ! gh_mutate_retry api -X POST "repos/$REPO/statuses/$live_head" \
    -f state=success \
    -f context="$UNMERGEABLE_EJECT_CONTEXT" \
    -f description="$description" \
    -f target_url="$target_url" >/dev/null; then
    echo "    !! failed to record exact-head UNMERGEABLE eject for #$n" >&2
    return 1
  fi
  echo "    +$UNMERGEABLE_EJECT_CONTEXT $description on #$n at $live_head"
}

# JOV-INV-011: a product-failure tombstone is a success status so the source PR remains
# CLEAN while Gem and Summer retain exact-head failure memory after bounded
# Actions history rolls over. A new source commit is the only automatic reset.
product_failure_receipt_head() {  # <head>
  local head="$1" statuses latest
  [[ "$head" =~ ^[0-9a-f]{40}$ ]] || return 1
  if ! statuses="$(gh_retry api "repos/$REPO/commits/$head/status" 2>/dev/null)"; then
    return 2
  fi
  if ! jq -e '.statuses | type == "array"' <<<"$statuses" >/dev/null 2>&1; then
    return 2
  fi
  latest="$(jq -c \
    --arg context "$PRODUCT_FAILURE_CONTEXT" \
    --arg description "$PRODUCT_FAILURE_DESCRIPTION" \
    --arg repo "$REPO" '
      [ .statuses[]? | select(.context == $context) ]
      | sort_by(.updated_at)
      | last
      | select(
          . != null
          and .state == "success"
          and .description == $description
          and (.target_url | test("^https://github\\.com/" + ($repo | gsub("/"; "\\/")) + "/actions/runs/[1-9][0-9]*$"))
        )
    ' <<<"$statuses" 2>/dev/null)" || true
  if [[ -n "$latest" ]] && receipt_actor_is_trusted "$head" "$latest"; then
    printf '%s\n' "$head"
  fi
  return 0
}

record_product_failure_receipt() {  # <pr> <expected-head>
  local n="$1" expected_head="$2" current live_head target_url receipt_head receipt_rc
  if [[ ! "$expected_head" =~ ^[0-9a-f]{40}$ ]]; then
    echo "    !! cannot record product-failure tombstone for #$n without an exact head" >&2
    return 1
  fi
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "    [dry-run] would record $PRODUCT_FAILURE_CONTEXT on #$n at $expected_head"
    return 0
  fi
  set +e
  receipt_head="$(product_failure_receipt_head "$expected_head")"
  receipt_rc=$?
  set -e
  if [[ "$receipt_rc" -eq 0 && "$receipt_head" == "$expected_head" ]]; then
    echo "    =$PRODUCT_FAILURE_CONTEXT on #$n at $expected_head (already recorded)"
    return 0
  fi
  if [[ "$receipt_rc" -eq 2 ]]; then
    echo "    !! could not read product-failure tombstone state for #$n" >&2
    return 1
  fi
  if ! target_url="$(fleet_hold_target_url)"; then
    echo "    !! canonical workflow run identity is missing for product-failure tombstone #$n" >&2
    return 1
  fi
  if ! current="$(gh_retry pr view "$n" -R "$REPO" --json state,headRefOid 2>/dev/null)"; then
    echo "    !! could not refresh #$n before recording product-failure tombstone" >&2
    return 1
  fi
  live_head="$(jq -r '(.headRefOid // "") | ascii_downcase' <<<"$current")"
  if ! jq -e --arg head "$expected_head" '
    .state == "OPEN" and ((.headRefOid // "") | ascii_downcase) == $head
  ' <<<"$current" >/dev/null; then
    echo "    ⏸ #$n head changed before product-failure tombstone"
    return 2
  fi
  if ! gh_mutate_retry api -X POST "repos/$REPO/statuses/$live_head" \
    -f state=success \
    -f context="$PRODUCT_FAILURE_CONTEXT" \
    -f description="$PRODUCT_FAILURE_DESCRIPTION" \
    -f target_url="$target_url" >/dev/null; then
    echo "    !! failed to record exact-head product-failure tombstone for #$n" >&2
    return 1
  fi
  echo "    +$PRODUCT_FAILURE_CONTEXT $PRODUCT_FAILURE_DESCRIPTION on #$n at $live_head"
}

pr_changed_paths_json() {  # <num> → JSON string array or null
  local n="$1" files
  if ! files="$(gh_retry pr view "$n" -R "$REPO" --json files --jq '[.files[].path]' 2>/dev/null)"; then
    echo 'null'
    return 0
  fi
  if ! jq -e 'type == "array"' <<<"$files" >/dev/null 2>&1; then
    echo 'null'
    return 0
  fi
  printf '%s' "$files"
}

changelog_collision_decision_for_pr() {  # <num>
  local n="$1" candidate queued members='[]' files branch
  candidate="$(pr_changed_paths_json "$n")"
  branch="$(echo "$SNAP" | jq -r --argjson n "$n" '.[] | select(.n == $n) | .head // empty')"
  while read -r queued; do
    [[ -n "$queued" ]] || continue
    files="$(pr_changed_paths_json "$queued")"
    members="$(jq -c --argjson pr "$queued" --argjson files "$files" \
      '. + [{prNumber:$pr, files:$files}]' <<<"$members")"
  done < <(echo "$SNAP" | jq -r --argjson self "$n" \
    '.[] | select(.q == true) | select(.n != $self) | .n')
  CHANGELOG_COLLISION_JSON="$(jq -nc --argjson candidateFiles "$candidate" --argjson queuedMemberFiles "$members" --arg branch "$branch" \
    '{candidateFiles:$candidateFiles, queuedMemberFiles:$queuedMemberFiles, branch:$branch}')" \
    node scripts/ci-merge-queue-check.mjs changelog-collision
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
      . == "fast" or . == "needs-conflict-resolution"
      or '"$NO_AUTO_HOLD_JQ"'
    ) | not)
  ' <<<"$1" >/dev/null
}

restore_deferred_hold() {  # restore_deferred_hold <num>
  local n="$1"
  [[ "$DRY_RUN" == "1" ]] && return 0
  if gh_mutate_retry pr edit "$n" -R "$REPO" --add-label queue-deferred >/dev/null 2>&1; then
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
    if ! gh_mutate_retry pr edit "$n" -R "$REPO" --remove-label queue-deferred >/dev/null 2>&1; then
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
          . == "fast" or . == "needs-conflict-resolution"
          or '"$NO_AUTO_HOLD_JQ"'
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
  local current enrollment_receipt head_oid expected_head json_fields live_head mergeability_attempt mergeability_state queue_position queue_state
  LAST_ENROLL_SKIP_REASON=""
  json_fields="state,isDraft,mergeable,labels,headRefOid,baseRefName,body"
  for ((mergeability_attempt = 1; mergeability_attempt <= DRAIN_MERGEABLE_RECHECK_ATTEMPTS; mergeability_attempt++)); do
    if ! current="$(gh_retry pr view "$n" -R "$REPO" \
      --json "$json_fields" 2>/dev/null)"; then
      echo "    !! could not refresh #$n eligibility; refusing enrollment" >&2
      return 1
    fi
    mergeability_state="$(jq -r '.mergeable // "UNKNOWN"' <<<"$current")"
    [[ "$mergeability_state" == "MERGEABLE" ]] && break
    [[ "$mergeability_state" == "UNKNOWN" ]] || break
    live_head="$(jq -r '.headRefOid // empty' <<<"$current" | tr '[:upper:]' '[:lower:]')"
    if [[ "$n" != "$authorized_pr" || "$live_head" != "$authorized_head" ]] \
      || ! jq -e '
        .state == "OPEN"
        and (.isDraft | not)
        and .baseRefName == "main"
        and ([.labels[].name] | any(
          . == "needs-conflict-resolution" or . == "fast"
          or '"$NO_AUTO_HOLD_JQ"'
        ) | not)
      ' <<<"$current" >/dev/null; then
      break
    fi
    if (( mergeability_attempt < DRAIN_MERGEABLE_RECHECK_ATTEMPTS )); then
      echo "    ~ mergeable=UNKNOWN for #$n at $live_head; bounded live reread $mergeability_attempt/$DRAIN_MERGEABLE_RECHECK_ATTEMPTS"
      sleep "$DRAIN_MERGEABLE_RECHECK_SECONDS"
    fi
  done
  if ! jq -e --arg backend "$MERGE_QUEUE_BACKEND" '
    .state == "OPEN"
    and (.isDraft | not)
    and .mergeable == "MERGEABLE"
    and .baseRefName == "main"
    and ([.labels[].name] | any(
      . == "needs-conflict-resolution"
      or . == "fast" or ($backend == "test-label-fixture" and . == "merge-queue")
      or '"$NO_AUTO_HOLD_JQ"'
    ) | not)
  ' <<<"$current" >/dev/null; then
    echo "    ⏸ eligibility changed; refusing enrollment for #$n"
    return 2
  fi
  if jq -e '[.labels[].name] | index("queue-deferred")' <<<"$current" >/dev/null; then
    if [[ "$DRAIN_PROMOTION_MODE" != "hold-intake" && "$DRAIN_PROMOTION_MODE" != "normal" ]]; then
      echo "    ⏸ queue-deferred hold still applies for #$n"
      return 2
    fi
    if [[ "$DRY_RUN" == "1" ]]; then
      echo "    [dry-run] would -queue-deferred on #$n (exact admission)"
    else
      if ! gh_mutate_retry pr edit "$n" -R "$REPO" --remove-label queue-deferred >/dev/null 2>&1; then
        echo "    !! failed to remove queue-deferred on #$n" >&2
        return 1
      fi
      echo "    -queue-deferred on #$n (exact admission under $DRAIN_PROMOTION_MODE)"
      if ! current="$(gh_retry pr view "$n" -R "$REPO" --json "$json_fields" 2>/dev/null)"; then
        echo "    !! could not refresh #$n after releasing queue-deferred" >&2
        return 1
      fi
    fi
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
  local churn_disposition
  churn_disposition="$(front_churn_disposition "$n" "$expected_head")"
  case "$churn_disposition" in
    block-product)
      if ! record_product_failure_receipt "$n" "$expected_head"; then
        echo "    !! refusing enrollment without durable product-failure memory for #$n" >&2
        return 1
      fi
      echo "    ⏸ unchanged head has a durable classified/repeated merge-group failure; refusing re-enrollment for #$n until the source head moves"
      LAST_ENROLL_SKIP_REASON="product-failure-tombstone"
      return 2
      ;;
    block-transient)
      echo "    ⏸ unchanged head is inside the bounded unclassified failure cooldown; refusing re-enrollment for #$n"
      LAST_ENROLL_SKIP_REASON="front-churn"
      return 2
      ;;
    receipt-unknown)
      echo "    !! product-failure tombstone state is unavailable for #$n; refusing enrollment" >&2
      return 1
      ;;
  esac
  if [[ "$MERGE_QUEUE_BACKEND" == "native" ]]; then
    local eject_head reenqueue_decision reenqueue_action collision_decision collision_action
    eject_head="$(unmergeable_eject_receipt_head "$expected_head")"
    reenqueue_decision="$(UNMERGEABLE_REENQUEUE_JSON="$(jq -nc \
      --arg headSha "$expected_head" \
      --arg ejectReceiptHeadSha "$eject_head" \
      '{headSha:$headSha, ejectReceiptHeadSha:$ejectReceiptHeadSha}')" \
      node scripts/ci-merge-queue-check.mjs unmergeable-reenqueue)"
    reenqueue_action="$(jq -r '.action // empty' <<<"$reenqueue_decision")"
    if [[ "$reenqueue_action" == "block" ]]; then
      echo "    ⏸ unchanged head already received a typed UNMERGEABLE eject; refusing re-enrollment for #$n"
      LAST_ENROLL_SKIP_REASON="unmergeable-tombstone"
      return 2
    fi
    collision_decision="$(changelog_collision_decision_for_pr "$n")"
    collision_action="$(jq -r '.action // empty' <<<"$collision_decision")"
    if [[ "$collision_action" == "skip" ]]; then
      echo "    ⏸ pre-land CHANGELOG.md edit is prohibited ($(jq -r '.reason' <<<"$collision_decision")) for #$n; refusing native queue admission without bypassing CI"
      LAST_ENROLL_SKIP_REASON="$(jq -r '.reason // "pre-land-changelog"' <<<"$collision_decision")"
      return 2
    fi
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
  elif [[ "$DRAIN_PROMOTION_MODE" == "hold-intake" || "$DRAIN_PROMOTION_MODE" == "draft-only" ]]; then
    : # Waiting lanes must not strip enroll from CLEAN unrelated PRs.
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
        . == "queue-deferred" or . == "needs-conflict-resolution"
        or . == "fast"
        or '"$NO_AUTO_HOLD_JQ"'
      ) | not)
    ' <<<"$current" >/dev/null; then
      echo "    ⏸ eligibility changed during native enrollment for #$n; compensating"
      if ! dequeue_strict "$n"; then
        echo "    !! CRITICAL: could not compensate held native enrollment for #$n" >&2
        return 1
      fi
      return 2
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
  if ! gh_mutate_retry pr edit "$n" -R "$REPO" --add-label merge-queue >/dev/null; then
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
      . == "queue-deferred" or . == "needs-conflict-resolution"
      or . == "fast"
      or '"$NO_AUTO_HOLD_JQ"'
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
  if ! gh_mutate_retry pr edit "$n" -R "$REPO" --remove-label merge-queue >/dev/null; then
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

# Exact-head admission reads one PR. Maintenance pages native queue state
# (first:30) instead of two `gh pr list --limit 200` fleet dumps before enroll.
if [[ "$MERGE_QUEUE_BACKEND" == "native" ]]; then
  if [[ "$DRY_RUN" != "1" ]]; then
    node scripts/merge-queue-backend.mjs preflight >/dev/null
  fi
  if [[ -n "$DRAIN_ADMISSION_PR" ]]; then
    echo "=== SNAP (exact-head #$DRAIN_ADMISSION_PR) ==="
    if ! NATIVE_QUEUE_STATE="$(inventory_native_queue_state "$DRAIN_ADMISSION_PR")"; then
      echo "::error::Exact-target native queue read failed for #$DRAIN_ADMISSION_PR" >&2
      exit 1
    fi
  else
    echo "=== SNAP (paged inventory) ==="
    if ! NATIVE_QUEUE_STATE="$(inventory_native_queue_state)"; then
      echo "::error::Paged native queue inventory failed" >&2
      exit 1
    fi
  fi
  SNAP="$(native_state_to_snap <<<"$NATIVE_QUEUE_STATE")"
else
  SNAP="$(gh_inventory_retry pr list -R "$REPO" --state open --limit 200 \
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
  SNAP="$(jq -c '
    map(. + {q: (((.L // []) | index("merge-queue")) != null)})
  ' <<<"$SNAP")"
fi

echo "=== RETARGET (base must be main) ==="
retargeted=0
while IFS= read -r pr; do
  n="$(jq -r '.n' <<<"$pr")"
  base="$(jq -r '.base' <<<"$pr")"
  t="$(jq -r '.t' <<<"$pr")"
  if [[ ! "$n" =~ ^[1-9][0-9]*$ || -z "$base" || "$base" == "null" ]]; then
    continue
  fi
  echo "  #$n  $t  $base → main"
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "    [dry-run] would gh pr edit $n --base main"
  else
    if ! gh_retry pr edit "$n" -R "$REPO" --base main >/dev/null; then
      echo "::error::Failed to retarget #$n from $base to main" >&2
      exit 1
    fi
  fi
  retargeted=$((retargeted + 1))
done < <(jq -c '
  .[]
  | select((.n | type == "number") and (.base | type == "string") and .base != "main")
' <<<"$SNAP")
if [[ "$retargeted" -eq 0 ]]; then
  echo "  (none)"
elif [[ "$DRY_RUN" != "1" ]]; then
  if [[ "$MERGE_QUEUE_BACKEND" == "native" ]]; then
    if [[ -n "$DRAIN_ADMISSION_PR" ]]; then
      if ! NATIVE_QUEUE_STATE="$(inventory_native_queue_state "$DRAIN_ADMISSION_PR")"; then
        echo "::error::Exact-target native queue reread failed after retarget for #$DRAIN_ADMISSION_PR" >&2
        exit 1
      fi
    else
      if ! NATIVE_QUEUE_STATE="$(inventory_native_queue_state)"; then
        echo "::error::Paged native queue inventory failed after retarget" >&2
        exit 1
      fi
    fi
    SNAP="$(native_state_to_snap <<<"$NATIVE_QUEUE_STATE")"
  else
    SNAP="$(gh_inventory_retry pr list -R "$REPO" --state open --limit 200 \
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
    SNAP="$(jq -c '
      map(. + {q: (((.L // []) | index("merge-queue")) != null)})
    ' <<<"$SNAP")"
  fi
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
  MERGE_GROUP_RUNS_JSON="$(gh_retry api "repos/${REPO}/actions/workflows/ci.yml/runs?event=merge_group&per_page=100" \
    --jq '[.workflow_runs[]? | {id, headBranch: .head_branch, status, conclusion, headSha: .head_sha, createdAt: .created_at, updatedAt: .updated_at}]' 2>/dev/null || echo '[]')"
  export MERGE_GROUP_RUNS_JSON
fi

# front_churn_disposition <num> <head_oid> → prints
# allow|block-product|block-transient|unknown|receipt-unknown.
# Annotate recent failed fronts, not only the latest run. A single-run
# failedSteps payload never reaches MERGE_GROUP_CHURN_FAILURE_THRESHOLD=2, so
# unit-test merge_group failures re-enrolled forever as main moved (#16238,
# reproduced by #16441 on 2026-08-27).
front_churn_disposition() {
  local n="$1" head_oid="$2" committed run_id jobs_json runs_json
  local receipt_head receipt_rc decision action failure_class
  if [[ "$MERGE_QUEUE_BACKEND" != "native" ]]; then
    echo "unknown"
    return 0
  fi
  set +e
  receipt_head="$(product_failure_receipt_head "$head_oid")"
  receipt_rc=$?
  set -e
  if [[ "$receipt_rc" -eq 2 ]]; then
    echo "receipt-unknown"
    return 0
  fi
  if [[ "$receipt_rc" -eq 0 && "$receipt_head" == "$head_oid" ]]; then
    echo "block-product"
    return 0
  fi
  if [[ ! "$MAIN_HEAD_SHA" =~ ^[0-9a-f]{40}$ ]]; then
    echo "unknown"
    return 0
  fi
  committed="$(gh_retry api "repos/${REPO}/commits/${head_oid}" --jq '.commit.committer.date // empty' 2>/dev/null || true)"
  runs_json="$MERGE_GROUP_RUNS_JSON"
  while IFS= read -r run_id; do
    [[ "$run_id" =~ ^[1-9][0-9]*$ ]] || continue
    if jq -e --argjson run_id "$run_id" '
      any(.[]; .id == $run_id and (.failedSteps | type == "array"))
    ' <<<"$runs_json" >/dev/null; then
      continue
    fi
    jobs_json="$(gh_retry api "repos/${REPO}/actions/runs/${run_id}/jobs?per_page=100" --paginate \
      --jq '[.jobs[]? | .steps[]? | select(.conclusion == "failure") | .name]' 2>/dev/null || echo '[]')"
    if jq -e 'type == "array" and all(.[]; type == "string")' <<<"$jobs_json" >/dev/null; then
      runs_json="$(jq -c --argjson run_id "$run_id" --argjson failed_steps "$jobs_json" '
        map(if .id == $run_id then . + {failedSteps: $failed_steps} else . end)
      ' <<<"$runs_json")"
    fi
  done < <(jq -r --arg prefix "gh-readonly-queue/main/pr-${n}-" '
    [.[]
      | select((.headBranch // "") | startswith($prefix))
      | select(.status == "completed")
      | select(.conclusion == "failure" or .conclusion == "timed_out"
        or .conclusion == "action_required" or .conclusion == "startup_failure"
        or .conclusion == "stale")]
    | sort_by(.createdAt) | reverse | .[0:8][]? | .id
  ' <<<"$runs_json")
  MERGE_GROUP_RUNS_JSON="$runs_json"
  if ! decision="$(MERGE_GROUP_RUNS_JSON="$runs_json" \
    node scripts/ci-merge-queue-check.mjs front-churn \
      --pr="$n" --base="$MAIN_HEAD_SHA" --head-committed-at="$committed" 2>/dev/null)"; then
    echo "unknown"
    return 0
  fi
  action="$(jq -r '.action // "unknown"' <<<"$decision" 2>/dev/null || echo unknown)"
  failure_class="$(jq -r '.evidence.failureClass // empty' <<<"$decision" 2>/dev/null || true)"
  if [[ "$action" == "block" \
    && ( "$failure_class" == "deterministic-product-check" \
      || "$failure_class" == "repeated-product-check" ) ]]; then
    echo "block-product"
  elif [[ "$action" == "block" ]]; then
    echo "block-transient"
  elif [[ "$action" == "allow" || "$action" == "unknown" ]]; then
    echo "$action"
  else
    echo "unknown"
  fi
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
  if jq -e --arg admission_pr "$DRAIN_ADMISSION_PR" '
    (.draft | not)
    and (.base == "main")
    and (.m == "MERGEABLE")
    and (
      (([.L[]] | any(. == "fast" or '"$NO_AUTO_HOLD_JQ"')) | not)
      and (
        (([.L[]] | index("queue-deferred")) == null)
        or ((.n | tostring) == $admission_pr)
      )
    )
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

# isolated-only (production-red) may keep one freshly proven isolated entry
# and dequeues ordinary members. Waiting lanes — hold-intake, draft-only /
# main-not-green, and blocked-unknown — must not dequeue CLEAN unrelated PRs
# or stamp an unbounded pending hold on them. JOV-5169.
DRAIN_FREEZE_EXISTING_QUEUE=0
if [[ "$DRAIN_PROMOTION_MODE" == "isolated-only" ]]; then
  DRAIN_FREEZE_EXISTING_QUEUE=1
fi

# --- SUMMARY: make queue shape obvious in scheduled logs ---
echo "=== QUEUE SUMMARY ==="
echo "$SNAP" | jq -r '
  def labels: (.L // []);
  def main_target: .base == "main";
  def queued: .q == true;
  def hard_gated: labels | any(. == "queue-deferred" or '"$NO_AUTO_HOLD_JQ"');
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
  | select(.draft or ([.L[]] | any(. == "queue-deferred" or '"$NO_AUTO_HOLD_JQ"')))')

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
        | select(([.L[]] | any(. == "queue-deferred" or '"$NO_AUTO_HOLD_JQ"')) | not)
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
    | select(([.L[]] | any(. == "queue-deferred" or '"$NO_AUTO_HOLD_JQ"')) | not)')
fi

# --- DEQUEUE: parked UNMERGEABLE native entries (JOV-5291) ---
# GitHub leaves an UNMERGEABLE group member in the queue forever. The source
# PR can stay MERGEABLE/CLEAN (CHANGELOG ALLGREEN collision is the measured
# case). Eject with a typed exact-head receipt and do not re-enqueue that head.
echo "=== DEQUEUE (UNMERGEABLE native entry → typed eject) ==="
if waiting_lane_allows_clean_enroll \
  || [[ "$DRAIN_PROMOTION_MODE" == "blocked" && "$DRAIN_FREEZE_EXISTING_QUEUE" == "0" ]]; then
  while read -r pr; do
    n=$(jq -r '.n' <<<"$pr"); t=$(jq -r '.t' <<<"$pr")
    head_oid="$(jq -r '.headOid // ""' <<<"$pr" | tr '[:upper:]' '[:lower:]')"
    decision="$(UNMERGEABLE_EJECT_JSON="$(jq -nc \
      --argjson queued true \
      --arg queueEntryState "$(jq -r '.qs // empty' <<<"$pr")" \
      --arg mergeable "$(jq -r '.m // empty' <<<"$pr")" \
      --arg headSha "$head_oid" \
      '{queued:$queued, queueEntryState:$queueEntryState, mergeable:$mergeable, headSha:$headSha}')" \
      node scripts/ci-merge-queue-check.mjs unmergeable-eject)"
    action="$(jq -r '.action // empty' <<<"$decision")"
    reason="$(jq -r '.reason // empty' <<<"$decision")"
    if [[ "$action" != "eject" ]]; then
      if [[ "$action" == "unknown" ]]; then
        echo "  #$n  $t  ~ UNMERGEABLE evidence unavailable ($reason); leaving queued"
      fi
      continue
    fi
    echo "  #$n  $t  ✗ $reason"
    if ! dequeue_strict "$n"; then
      echo "::error::Failed to prove UNMERGEABLE PR #$n is outside native merge queue" >&2
      exit 1
    fi
    if ! record_unmergeable_eject_receipt "$n" "$head_oid" "$reason"; then
      echo "::error::Failed to record typed UNMERGEABLE eject for #$n at $head_oid" >&2
      exit 1
    fi
  done < <(echo "$SNAP" | jq -c '.[]
    | select(.q == true)
    | select(([.L[]] | any(.=="queue-deferred" or '"$NO_AUTO_HOLD_JQ"')) | not)')
fi

# --- INVENTORY + DEQUEUE: pre-land CHANGELOG.md (JOV-5378) ---
# Implementation PRs must not edit CHANGELOG.md. Queued members that still
# carry the file are dequeued with reenqueue=false. Enrollment skip is a
# classified skip, not a CI bypass.
echo "=== INVENTORY (pre-land CHANGELOG.md) ==="
echo "=== DEQUEUE (pre-land CHANGELOG.md → drain without CI bypass) ==="
if waiting_lane_allows_clean_enroll \
  || [[ "$DRAIN_PROMOTION_MODE" == "blocked" && "$DRAIN_FREEZE_EXISTING_QUEUE" == "0" ]]; then
  changelog_open='[]'
  while read -r pr; do
    n=$(jq -r '.n' <<<"$pr"); t=$(jq -r '.t' <<<"$pr")
    head_ref="$(jq -r '.head // empty' <<<"$pr")"
    files="$(pr_changed_paths_json "$n")"
    changelog_open="$(jq -c --argjson n "$n" --argjson files "$files" --arg head "$head_ref" \
      '. + [{number:$n, files:$files, headRefName:$head, queued:true}]' <<<"$changelog_open")"
    drain_decision="$(CHANGELOG_COLLISION_JSON="$(jq -nc --argjson files "$files" --argjson queued true --arg branch "$head_ref" \
      '{files:$files, queued:$queued, branch:$branch}')" \
      node scripts/ci-merge-queue-check.mjs changelog-drain)"
    drain_action="$(jq -r '.action // empty' <<<"$drain_decision")"
    if [[ "$drain_action" != "dequeue" ]]; then
      continue
    fi
    echo "  #$n  $t  ✗ pre-land-changelog"
    if ! dequeue_strict "$n"; then
      echo "::error::Failed to prove CHANGELOG PR #$n is outside native merge queue" >&2
      exit 1
    fi
  done < <(echo "$SNAP" | jq -c '.[]
    | select(.q == true)
    | select(.draft | not)
    | select(([.L[]] | any(.=="queue-deferred" or '"$NO_AUTO_HOLD_JQ"')) | not)')
  inventory="$(CHANGELOG_COLLISION_JSON="$(jq -nc --argjson openPrs "$changelog_open" '{openPrs:$openPrs}')" \
    node scripts/ci-merge-queue-check.mjs changelog-inventory)"
  echo "  inventory count=$(jq -r '.count' <<<"$inventory") reason=$(jq -r '.reason' <<<"$inventory")"
  echo "$inventory" | jq -r '.prs[]? | "  #\(.number)  \(.headRefName // "unknown")  queued=\(.queued)"'
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
  | select($promotion_mode == "normal" or $promotion_mode == "hold-intake" or $promotion_mode == "draft-only" or ($promotion_mode == "blocked" and $freeze == "0"))
  | select(.q == true)
  | select(([.L[]] | any(.=="queue-deferred" or '"$NO_AUTO_HOLD_JQ"')) | not)
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
if waiting_lane_allows_clean_enroll || [[ "$DRAIN_PROMOTION_MODE" == "blocked" && "$DRAIN_FREEZE_EXISTING_QUEUE" == "0" ]]; then
  echo "=== DEQUEUE (non-progressing front → queue removal) ==="
  while read -r pr; do
    n=$(jq -r '.n' <<<"$pr"); t=$(jq -r '.t' <<<"$pr")
    head_oid="$(jq -r '.headOid // ""' <<<"$pr")"
    [[ "$head_oid" =~ ^[0-9a-f]{40}$ ]] || continue
    churn_disposition="$(front_churn_disposition "$n" "$head_oid")"
    if [[ "$churn_disposition" == "block-product" ]]; then
      echo "  #$n  $t  ✗ unchanged head has a durable classified/repeated merge-group failure"
      if ! record_product_failure_receipt "$n" "$head_oid"; then
        echo "::error::Failed to record product-failure tombstone for #$n at $head_oid" >&2
        exit 1
      fi
      if ! dequeue_strict "$n"; then
        echo "::error::Failed to prove non-progressing front PR #$n is outside native merge queue" >&2
        exit 1
      fi
    elif [[ "$churn_disposition" == "block-transient" ]]; then
      echo "  #$n  $t  ✗ bounded unclassified merge-group failure cooldown"
      if ! dequeue_strict "$n"; then
        echo "::error::Failed to prove transiently non-progressing PR #$n is outside native merge queue" >&2
        exit 1
      fi
    elif [[ "$churn_disposition" == "receipt-unknown" ]]; then
      echo "  #$n  $t  ~ product-failure tombstone state unavailable; leaving queued"
    fi
  done < <(echo "$SNAP" | jq -c '.[]
    | select(.q == true)
    | select(.base == "main")
    | select(.draft | not)
    | select(([.L[]] | any(.=="queue-deferred" or '"$NO_AUTO_HOLD_JQ"')) | not)')
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
if waiting_lane_allows_clean_enroll; then
  QUEUED_NOW=$(echo "$SNAP" | jq '[.[] | select(.q == true)] | length')
  ENROLL_SLOTS=$((MAX_QUEUE_DEPTH - QUEUED_NOW))
elif [[ "$DRAIN_PROMOTION_MODE" == "isolated-only" ]]; then
  MAX_QUEUE_DEPTH=1
  QUEUED_NOW=$([[ -n "${ISOLATED_KEEP_PR:-}" ]] && echo 1 || echo 0)
  ENROLL_SLOTS=$((MAX_QUEUE_DEPTH - QUEUED_NOW))
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
  if [[ "$DRAIN_RECONCILE_MISSED_ADMISSION" == "1" ]]; then
    echo "  admission scope: no primary target (bounded missed-admission recovery enabled)"
  else
    echo "  admission scope: maintenance-only (no new enrollment)"
  fi
else
  echo "  admission scope: #$DRAIN_ADMISSION_PR at $DRAIN_ADMISSION_HEAD"
fi

# Pending fleet-queue-hold statuses are never allowed to sit forever.
# Waiting lanes close them immediately so they cannot pin mergeStateStatus.
# Isolated-only holds expire at FLEET_HOLD_TTL_SECONDS with a terminal reason.
echo "=== RECONCILE (terminal fleet-queue-hold) ==="
while read -r pr; do
  stop_if_budget_exhausted && break
  n="$(jq -r '.n' <<<"$pr")"
  t="$(jq -r '.t' <<<"$pr")"
  head_oid="$(jq -r '.headOid // ""' <<<"$pr" | tr '[:upper:]' '[:lower:]')"
  [[ "$head_oid" =~ ^[0-9a-f]{40}$ ]] || continue
  latest="$(fleet_hold_latest "$head_oid" || true)"
  [[ -n "$latest" ]] || continue
  jq -e '.state == "pending"' <<<"$latest" >/dev/null || continue
  updated_at="$(jq -r '.updated_at // empty' <<<"$latest")"
  close_now=0
  close_why=""
  if waiting_lane_allows_clean_enroll || [[ "$DRAIN_PROMOTION_MODE" == "blocked" ]]; then
    close_now=1
    close_why="waiting-lane"
  elif fleet_hold_is_expired "$updated_at"; then
    close_now=1
    close_why="expired"
  fi
  [[ "$close_now" -eq 1 ]] || continue
  clean_eligible=0
  if jq -e '
    (.draft | not)
    and (.m == "MERGEABLE")
    and (.base == "main")
    and ((.fail // []) | length == 0)
    and (([.L[]] | any(. == "queue-deferred" or . == "needs-conflict-resolution" or . == "fast" or '"$NO_AUTO_HOLD_JQ"')) | not)
  ' <<<"$pr" >/dev/null; then
    clean_eligible=1
  fi
  if [[ "$clean_eligible" -eq 1 ]]; then
    close_state=success
    close_reason="Hold ${close_why} (${DRAIN_PROMOTION_MODE}); CLEAN enroll is not frozen"
  else
    close_state=failure
    close_reason="Hold ${close_why} (${DRAIN_PROMOTION_MODE}); terminal: not CLEAN-eligible"
  fi
  echo "  #$n  $t  ✳ $close_why -> $close_state"
  if ! close_fleet_hold "$n" "$head_oid" "$close_state" "$close_reason"; then
    echo "::error::Failed to close unbounded fleet hold on #$n" >&2
    exit 1
  fi
done < <(echo "$SNAP" | jq -c '.[] | select((.headOid // "") | test("^[0-9a-f]{40}$"))')

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
    if waiting_lane_allows_clean_enroll && [[ "$DRY_RUN" != "1" ]]; then
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
      or $promotion_mode == "hold-intake"
      or $promotion_mode == "draft-only"
      or ($promotion_mode == "isolated-only" and .iso == true)
    )
  | select((.n | tostring) == $admission_pr)
  | select(.draft|not)
  | select(.m=="MERGEABLE")
  | select(.base=="main")
  | select(.fail|length==0)
  | select(.q | not)
  | select([.L[]] | any(.=="needs-conflict-resolution" or .=="fast" or '"$NO_AUTO_HOLD_JQ"') | not)
  | select(
      ([.L[]] | index("queue-deferred") == null)
      or ((.n | tostring) == $admission_pr)
    )')

# A scoped CI-completion event that reaches this point without an exact-head
# native queue receipt is not a successful controller pass. Previously this
# returned success and left the PR invisible until an unrelated event happened.
# Fail with a classified machine-owned condition so Delivery Control Receipts
# emits a durable Gem repair task; it still cannot merge or bypass any gate.
if [[ -n "$DRAIN_ADMISSION_PR" && "$ENROLLED_THIS_RUN" -eq 0 ]]; then
  ADMISSION_DISPOSITION="$(echo "$SNAP" | node scripts/merge-queue-backend.mjs explain-selector \
    "$DRAIN_ADMISSION_PR" "$DRAIN_ADMISSION_HEAD" "$DRAIN_PROMOTION_MODE" "$ENROLL_SLOTS")"
  ADMISSION_TARGET_OBSERVED="$(jq -r '.observed' <<<"$ADMISSION_DISPOSITION")"
  ADMISSION_ALREADY_QUEUED="$(jq -r '.queued' <<<"$ADMISSION_DISPOSITION")"
  ADMISSION_ELIGIBLE="$(jq -r '.eligible' <<<"$ADMISSION_DISPOSITION")"
  ADMISSION_SELECTOR_REASON="$(jq -r '.reason' <<<"$ADMISSION_DISPOSITION")"
  # A changed head has invalidated the event scope. It must never inherit this
  # event's queue intent; the newer head's own event creates its receipt.
  # The pre-enrollment snapshot can race GitHub's native queue write. Before
  # publishing a terminal queue-noop, poll the authoritative native state for
  # isInMergeQueue plus a positioned mergeQueueEntry. Auto-merge intent is
  # never membership. A live hard-hold label added after SNAP is not a
  # successful receipt. Only an unheld exact-head receipt suppresses the error.
  if [[ "$MERGE_QUEUE_BACKEND" == "native" && "$DRY_RUN" != "1" \
    && "$ADMISSION_TARGET_OBSERVED" == "true" && "$ADMISSION_ALREADY_QUEUED" != "true" ]]; then
    LIVE_NATIVE_RECEIPT="$(node scripts/merge-queue-backend.mjs prove-receipt \
      "$DRAIN_ADMISSION_PR" "$DRAIN_ADMISSION_HEAD")"
    if jq -e '
      .ok == true
      and .state.isInMergeQueue == true
      and .state.queued == true
      and (.state.mergeQueueEntry.state | IN("QUEUED", "AWAITING_CHECKS", "MERGEABLE", "UNMERGEABLE", "LOCKED"))
      and (.state.mergeQueueEntry.position | type == "number" and floor == . and . > 0)
      and ((.state.headRefOid // "") | ascii_downcase) == $head
      and ((.state.labels.nodes // []) | map(.name) | any(. == "queue-deferred" or . == "needs-conflict-resolution" or . == "fast" or '"$NO_AUTO_HOLD_JQ"') | not)
    ' --arg head "$DRAIN_ADMISSION_HEAD" <<<"$LIVE_NATIVE_RECEIPT" >/dev/null; then
      ADMISSION_ALREADY_QUEUED="true"
      echo "  #$DRAIN_ADMISSION_PR  ~ delayed native receipt at $DRAIN_ADMISSION_HEAD (state $(jq -r '.state.mergeQueueEntry.state' <<<"$LIVE_NATIVE_RECEIPT"), position $(jq -r '.state.mergeQueueEntry.position' <<<"$LIVE_NATIVE_RECEIPT"))"
    else
      ADMISSION_MISSING_REASON="$(jq -r '.explanation.reason // "missing-receipt"' <<<"$LIVE_NATIVE_RECEIPT")"
    fi
  fi
  if [[ "$DRY_RUN" != "1" && "$ADMISSION_TARGET_OBSERVED" == "true" && "$ADMISSION_ALREADY_QUEUED" != "true" ]]; then
    if [[ "$LAST_ENROLL_SKIP_REASON" == "product-failure-tombstone" ]]; then
      echo "  #$DRAIN_ADMISSION_PR  ⏸ $LAST_ENROLL_SKIP_REASON (durable exact-head product failure; source repair required)"
    elif [[ "$LAST_ENROLL_SKIP_REASON" == "changelog-collision" \
      || "$LAST_ENROLL_SKIP_REASON" == "pre-land-changelog" \
      || "$LAST_ENROLL_SKIP_REASON" == "preland-changelog" \
      || "$LAST_ENROLL_SKIP_REASON" == "preland-changelog-prohibited" \
      || "$LAST_ENROLL_SKIP_REASON" == "unmergeable-tombstone" ]]; then
      echo "  #$DRAIN_ADMISSION_PR  ⏸ $LAST_ENROLL_SKIP_REASON (classified skip; enroll is not a product-quality failure)"
      echo "::error::queue-noop: classified-skip: exact admission #$DRAIN_ADMISSION_PR at $DRAIN_ADMISSION_HEAD ($LAST_ENROLL_SKIP_REASON; native admission refused, hard gate preserved)" >&2
      exit 3
    elif [[ "$ADMISSION_ELIGIBLE" == "true" ]]; then
      echo "::error::queue-noop: missing receipt: exact admission #$DRAIN_ADMISSION_PR at $DRAIN_ADMISSION_HEAD (${ADMISSION_MISSING_REASON:-missing-receipt})" >&2
      exit 3
    else
      echo "::error::queue-noop: selector: exact admission #$DRAIN_ADMISSION_PR at $DRAIN_ADMISSION_HEAD ($ADMISSION_SELECTOR_REASON)" >&2
      exit 3
    fi
  fi
fi

# A completed merge_group CI run is not attributable to an individual source
# PR, while GitHub's one pending mutex slot can discard an initial exact-head
# admission event before it starts. Reconcile both losses in one loop. A prior
# native receipt authorizes re-entry; the missed-admission path instead requires
# the same fresh positive source gates as normal admission. Every candidate is
# re-read by enroll_if_still_eligible and the event-scoped candidate plus all
# reconciliation sources share one total cap.
# Hold-intake/normal missed admission also considers CLEAN queue-deferred
# heads: exact admission already strips that label, but a main-push recovery
# used to filter them out and left CI-green Symphony heads (#16187) parked.
# The no-auto tombstone family is never part of that exception (JOV-5276).
if [[ "$DRAIN_RECONCILE_QUEUE_REENTRY" == "1" || "$DRAIN_RECONCILE_MISSED_ADMISSION" == "1" ]]; then
  echo "=== RECOVER (bounded exact-head native admission) ==="
  while read -r pr; do
    stop_if_budget_exhausted && break
    if [[ "$ENROLLED_THIS_RUN" -ge "$DRAIN_QUEUE_REENTRY_MAX_PER_RUN" ]]; then
      echo "  ~ reached total exact admission cap ($DRAIN_QUEUE_REENTRY_MAX_PER_RUN)"
      break
    fi
    if [[ "$ENROLLED_THIS_RUN" -ge "$ENROLL_SLOTS" ]]; then
      echo "  ~ queue depth cap reached before exact admission recovery"
      break
    fi
    n="$(jq -r '.n' <<<"$pr")"
    t="$(jq -r '.t' <<<"$pr")"
    head_oid="$(jq -r '.headOid // ""' <<<"$pr" | tr '[:upper:]' '[:lower:]')"
    recovery_kind=""
    if [[ "$DRAIN_RECONCILE_QUEUE_REENTRY" == "1" ]] \
      && queue_reentry_receipt_is_recoverable "$head_oid"; then
      recovery_kind="native re-entry"
    elif [[ "$DRAIN_RECONCILE_MISSED_ADMISSION" == "1" ]]; then
      recovery_kind="missed admission"
    else
      continue
    fi
    # The snapshot's check result can be stale. This is an exact-current-head
    # gate, independently re-read immediately before the native enrollment.
    fresh_failures="$(check_failures_for_pr "$n")"
    if [[ "$(jq 'length' <<<"$fresh_failures")" -ne 0 ]]; then
      echo "  #$n  $t  ⏸ current exact-head checks are not green"
      continue
    fi
    echo "  #$n  $t  ↻ exact $recovery_kind at $head_oid"
    if enroll_if_still_eligible "$n" "$n" "$head_oid"; then
      ENROLLED_THIS_RUN=$((ENROLLED_THIS_RUN + 1))
    else
      recovery_result=$?
      if [[ "$recovery_result" -ne 2 ]]; then
        echo "::error::Failed exact native admission recovery for #$n" >&2
        exit 1
      fi
    fi
  done < <(echo "$SNAP" | jq -c \
    --arg admission_pr "$DRAIN_ADMISSION_PR" \
    --arg promotion_mode "$DRAIN_PROMOTION_MODE" \
    --arg missed "$DRAIN_RECONCILE_MISSED_ADMISSION" \
    '[ .[]
    | select((.n | tostring) != $admission_pr)
    | select(.q | not)
    | select(.draft | not)
    | select(.m == "MERGEABLE")
    | select(.base == "main")
    | select(.fail | length == 0)
    | select([.L[]] | any(. == "needs-conflict-resolution" or . == "fast" or '"$NO_AUTO_HOLD_JQ"') | not)
    | select(
        ([.L[]] | index("queue-deferred") == null)
        or (
          $missed == "1"
          and ($promotion_mode == "hold-intake" or $promotion_mode == "normal")
        )
      )
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
    | select([.L[]] | any(. == "queue-deferred" or . == "needs-conflict-resolution" or . == "fast" or '"$NO_AUTO_HOLD_JQ"') | not)')
fi

# --- CONFLICT: needs rebase (agent branches only) → label + hand to fix agent ---
echo "=== CONFLICT (needs rebase → fix agent) ==="
echo "$SNAP" | jq -r --arg re "$AGENT_RE" '.[]
  | select(.m=="CONFLICTING")
  | select(.base=="main")
  | select(.head|test($re))
  | select([.L[]] | any(.=="queue-deferred" or .=="needs-conflict-resolution" or '"$NO_AUTO_HOLD_JQ"') | not)
  | "  #\(.n)  \(.t)  [\(.head)]"'
echo "$SNAP" | jq -r --arg re "$AGENT_RE" '.[]
  | select(.m=="CONFLICTING")
  | select(.base=="main")
  | select(.head|test($re))
  | select([.L[]] | any(.=="queue-deferred" or .=="needs-conflict-resolution" or '"$NO_AUTO_HOLD_JQ"') | not) | .n' \
| while read -r n; do [[ -n "$n" ]] && label "$n" needs-conflict-resolution; done

# --- BLOCKED: mergeable but red checks → hand to fix agent ---
echo "=== BLOCKED (red checks → fix agent) ==="
echo "$SNAP" | jq -r '.[]
  | select(.draft|not) | select(.m=="MERGEABLE") | select(.fail|length>0)
  | select(.base=="main")
  | select([.L[]] | any(.=="queue-deferred" or '"$NO_AUTO_HOLD_JQ"') | not)
  | "  #\(.n)  \(.t)  ✗ \(.fail|join(", "))"'

# --- SURFACE: drafts / mechanical deferrals → report only, never auto-close ---
echo "=== SURFACE (drafts and queue-deferred; not closed) ==="
echo "$SNAP" | jq -r '.[]
  | select(.draft or ([.L[]] | any(.=="queue-deferred" or '"$NO_AUTO_HOLD_JQ"')))
  | "  #\(.n)  \(.t)  {\(.L|join(","))}"'

echo "=== done (DRY_RUN=$DRY_RUN) ==="
