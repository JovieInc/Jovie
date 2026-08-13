#!/usr/bin/env bash
# Queue-Deferred Release
#
# Closes the Symphony In Review → native merge queue handoff. `queue-deferred`
# is a hard hold on the auto-ready and merge-queue paths. With a typed
# `jovie-queue-deferral/v1` receipt (scripts/lib/queue-deferral-receipt.mjs) a
# controller can finally distinguish a temporary mechanical hold from an
# explicit repair/human hold — and lift only the mechanical ones:
#
#   report  — for every open queue-deferred agent PR, print its age and typed
#             reason (or `untyped-hold-manual-release-required`) and raise a
#             ::warning once the hold is older than ALARM_MINUTES. This is the
#             scoreboard surface; it never mutates anything.
#   release — lift the hold only when ALL of the following hold:
#               1. a fresh (<= FLEET_MAX_AGE_SECONDS) `jovie-fleet-gate/v1`
#                  receipt with state GREEN and promotionAdmission.allowed
#               2. a valid typed deferral receipt whose head equals the PR's
#                  exact current head, with a releasable (mechanical) reason
#               3. the PR is OPEN, MERGEABLE, carries queue-deferred and no
#                  other hold label, and has zero failing required checks
#             The label is removed first; a draft is then marked ready. Both
#             transitions fire real PR events (app token), so the merge-queue
#             autoenroll controller revalidates and owns enrollment. Under
#             AMBER/RED/stale/unknown fleet state no mutation happens: the
#             draft keeps queue-deferred, matching the fleet admission
#             contract. Untyped holds are never released automatically.
#
# Discovery is never authorization: the exact head, draft bit, mergeability,
# and live labels are re-read before and after every mutation, with a
# compensating draft+label restore if the PR raced the promotion.
#
# Env:
#   REPO                     target repo (default JovieInc/Jovie)
#   DRY_RUN=1                classify and print only; mutate nothing
#   RELEASE_MODE             report | release | both (default both)
#   FLEET_RECEIPT_FILE       path to a fresh jovie-fleet-gate/v1 receipt
#                            (required for the release pass)
#   FLEET_MAX_AGE_SECONDS    receipt freshness window (default 600)
#   ALARM_MINUTES            report-pass age alarm threshold (default 12)
#   ATTEMPT_COOLDOWN_MINUTES min minutes between release attempts per PR
#                            (default 30; one upserted marker comment per PR)
set -euo pipefail

# shellcheck source=./scripts/lib/gh-retry.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/gh-retry.sh"

REPO="${REPO:-JovieInc/Jovie}"
DRY_RUN="${DRY_RUN:-0}"
RELEASE_MODE="${RELEASE_MODE:-both}"
FLEET_RECEIPT_FILE="${FLEET_RECEIPT_FILE:-}"
FLEET_MAX_AGE_SECONDS="${FLEET_MAX_AGE_SECONDS:-600}"
ALARM_MINUTES="${ALARM_MINUTES:-12}"
ATTEMPT_COOLDOWN_MINUTES="${ATTEMPT_COOLDOWN_MINUTES:-30}"
DEFERRAL_MARKER='<!-- bot-comment:queue-deferral -->'
RELEASE_MARKER="queue-deferral-release"
LIB="$(dirname "${BASH_SOURCE[0]}")/lib/queue-deferral-receipt.mjs"
# `queue-deferred` itself is expected; every OTHER hold label blocks release.
OTHER_HOLD_RE='^(needs-human|hold|gated|fast|needs-conflict-resolution)$'
AGENT_BRANCH_RE='^(tim/|codex/|agent/|claude/|linear/|codegen-bot/|symphony/)'
now_epoch="$(date -u +%s)"

iso_to_epoch() {  # iso_to_epoch <iso> — empty output on unparseable input
  date -u -d "$1" +%s 2>/dev/null \
    || python3 -c "import datetime,sys; print(int(datetime.datetime.fromisoformat(sys.argv[1].replace('Z','+00:00')).timestamp()))" "$1" 2>/dev/null \
    || true
}

read_state() {  # read_state <num> — one API snapshot; discovery is never authorization
  gh_retry pr view "$1" -R "$REPO" \
    --json isDraft,headRefOid,headRefName,labels,mergeable,state \
    --jq '{draft: .isDraft, head: .headRefOid, branch: .headRefName, labels: [.labels[].name], mergeable: .mergeable, state: .state}'
}

# Live state must still show an open, mergeable PR carrying queue-deferred (and
# no other hold) on the exact expected head/branch.
state_is_releasable() {  # state_is_releasable <json> <expected-head> <expected-branch>
  jq -e --arg expected_head "$2" --arg expected_branch "$3" --arg other_hold_re "$OTHER_HOLD_RE" '
    .state == "OPEN"
    and .head == $expected_head
    and .branch == $expected_branch
    and .mergeable == "MERGEABLE"
    and ([.labels[] | select(. == "queue-deferred")] | length == 1)
    and ([.labels[] | select(test($other_hold_re))] | length == 0)
  ' <<<"$1" >/dev/null
}

# Latest valid typed deferral receipt for a PR. Empty output = untyped hold.
deferral_receipt_for_pr() {  # deferral_receipt_for_pr <num>
  local body
  body="$(gh_retry api "repos/${REPO}/issues/${1}/comments" --paginate \
    --jq "[.[] | select(.body | contains(\"${DEFERRAL_MARKER}\")) | .body] | last // empty" \
    2>/dev/null || true)"
  [[ -z "$body" ]] && return 0
  node "$LIB" extract <<<"$body" 2>/dev/null || true
}

check_failures_for_pr() {  # check_failures_for_pr <num> — JSON array of blocker reasons
  local n="$1" raw_file err
  raw_file="$(mktemp)"
  if gh_retry pr checks "$n" -R "$REPO" \
      --json name,bucket,state,workflow,description,startedAt,completedAt >"$raw_file" 2>/dev/null \
    && jq -e 'type == "array"' "$raw_file" >/dev/null 2>&1 \
    && node "$(dirname "${BASH_SOURCE[0]}")/lib/pr-check-failures.mjs" \
      --classify-auto-ready <"$raw_file"; then
    rm -f "$raw_file"
    return 0
  fi
  err="$(<"$raw_file")"
  rm -f "$raw_file"
  [[ -n "$err" ]] && echo "  !! could not classify required checks for #$n" >&2
  jq -cn --arg reason "required check status unavailable" '[$reason]'
}

# Minutes since the last release-attempt marker comment; empty = never attempted.
last_attempt_age_minutes() {  # last_attempt_age_minutes <num>
  local updated_at updated_epoch
  updated_at="$(gh_retry api "repos/${REPO}/issues/${1}/comments" --paginate \
    --jq "[.[] | select(.body | contains(\"<!-- bot-comment:${RELEASE_MARKER} -->\")) | .updated_at] | last" \
    2>/dev/null | grep -E '^[0-9]{4}-' | tail -n1 || true)"
  [[ -z "$updated_at" || "$updated_at" == "null" ]] && return 0
  updated_epoch="$(iso_to_epoch "$updated_at")"
  [[ -z "$updated_epoch" ]] && return 0
  echo $(( (now_epoch - updated_epoch) / 60 ))
}

upsert_status_comment() {  # upsert_status_comment <num> <body>
  [[ "$DRY_RUN" == "1" ]] && { echo "    [dry-run] would upsert release comment on #$1"; return 0; }
  GITHUB_REPOSITORY="$REPO" bash "$(dirname "${BASH_SOURCE[0]}")/lib/upsert-pr-comment.sh" "$1" "$RELEASE_MARKER" "$2" \
    && echo "    ✓ upserted release comment on #$1" || echo "    !! failed to upsert release comment on #$1"
}

remove_hold_label() {  # remove_hold_label <num>
  [[ "$DRY_RUN" == "1" ]] && { echo "    [dry-run] would remove \`queue-deferred\` from #$1"; return 0; }
  if gh_retry pr edit "$1" -R "$REPO" --remove-label queue-deferred >/dev/null 2>&1; then
    echo "    ✓ removed \`queue-deferred\` from #$1"
    return 0
  fi
  echo "    !! failed to remove \`queue-deferred\` from #$1"
  return 1
}

restore_hold_label() {  # restore_hold_label <num> — compensation; never masked
  [[ "$DRY_RUN" == "1" ]] && return 0
  if gh_retry pr edit "$1" -R "$REPO" --add-label queue-deferred >/dev/null 2>&1; then
    echo "    ✓ compensated: restored \`queue-deferred\` on #$1"
    return 0
  fi
  echo "    !! compensating label restore failed for #$1"
  return 1
}

mark_ready() {  # mark_ready <num>
  [[ "$DRY_RUN" == "1" ]] && { echo "    [dry-run] would mark #$1 ready"; return 0; }
  if gh_retry pr ready "$1" -R "$REPO" >/dev/null 2>&1; then
    echo "    ✓ marked #$1 ready"
    return 0
  fi
  echo "    !! failed to mark #$1 ready"
  return 1
}

echo "=== QUEUE-DEFERRED: scanning open queue-deferred agent PRs ==="

SNAP="$(gh_retry pr list -R "$REPO" --state open --limit 200 \
  --json number,title,isDraft,mergeable,labels,headRefName,headRefOid,updatedAt --jq '
  [ .[] | {
    n: .number,
    t: (.title[0:48]),
    draft: .isDraft,
    m: .mergeable,
    head: .headRefName,
    oid: .headRefOid,
    updated: .updatedAt,
    L: [.labels[].name]
  } ]')"

CANDIDATES="$(jq -c --arg branch_re "$AGENT_BRANCH_RE" '.[]
  | select([.L[]] | any(. == "queue-deferred"))
  | select(.head | test($branch_re))' <<<"$SNAP")"

if [[ -z "$CANDIDATES" ]]; then
  echo "  (no queue-deferred agent PRs)"
fi

# ---------------------------------------------------------------------------
# REPORT pass — age + typed reason for every deferred PR; alarm past the SLA.
# ---------------------------------------------------------------------------
if [[ "$RELEASE_MODE" == "report" || "$RELEASE_MODE" == "both" ]]; then
  echo "=== REPORT: age and reason for every queue-deferred PR ==="
  alarmed=0
  {
    echo "| PR | age (min) | reason | draft | mergeable |"
    echo "| --- | --- | --- | --- | --- |"
  } >>"${GITHUB_STEP_SUMMARY:-/dev/null}" 2>/dev/null || true
  while read -r pr; do
    [[ -z "$pr" ]] && continue
    n=$(jq -r '.n' <<<"$pr")
    receipt="$(deferral_receipt_for_pr "$n")"
    if [[ -n "$receipt" ]]; then
      reason="$(jq -r '.reason' <<<"$receipt")"
      deferred_epoch="$(iso_to_epoch "$(jq -r '.deferredAt' <<<"$receipt")")"
    else
      reason="untyped-hold-manual-release-required"
      deferred_epoch=""
    fi
    if [[ -z "$deferred_epoch" ]]; then
      deferred_epoch="$(iso_to_epoch "$(jq -r '.updated' <<<"$pr")")"
    fi
    age_min="?"
    if [[ -n "$deferred_epoch" ]]; then
      age_min=$(( (now_epoch - deferred_epoch) / 60 ))
    fi
    echo "  #$n  age=${age_min}m  reason=${reason}  draft=$(jq -r '.draft' <<<"$pr")  mergeable=$(jq -r '.m' <<<"$pr")"
    echo "| #$n | ${age_min} | ${reason} | $(jq -r '.draft' <<<"$pr") | $(jq -r '.m' <<<"$pr") |" \
      >>"${GITHUB_STEP_SUMMARY:-/dev/null}" 2>/dev/null || true
    if [[ "$age_min" != "?" && "$age_min" -ge "$ALARM_MINUTES" ]]; then
      alarmed=$((alarmed + 1))
      echo "::warning::queue-deferred #$n held for ${age_min}m (>= ${ALARM_MINUTES}m SLA), reason=${reason}"
    fi
  done <<<"$CANDIDATES"
  echo "=== REPORT done (${alarmed} PR(s) past the ${ALARM_MINUTES}m alarm) ==="
fi

# ---------------------------------------------------------------------------
# RELEASE pass — lift mechanical holds under a fresh GREEN fleet receipt.
# ---------------------------------------------------------------------------
if [[ "$RELEASE_MODE" == "release" || "$RELEASE_MODE" == "both" ]]; then
  echo "=== RELEASE: typed mechanical holds under a fresh GREEN fleet gate ==="

  release_allowed=0
  release_block_reason=""
  if [[ -z "$FLEET_RECEIPT_FILE" || ! -f "$FLEET_RECEIPT_FILE" ]]; then
    release_block_reason="fleet-receipt-unavailable"
  elif ! jq -e '.schema == "jovie-fleet-gate/v1" and (.observedAt | type == "string")' \
      "$FLEET_RECEIPT_FILE" >/dev/null 2>&1; then
    release_block_reason="fleet-receipt-malformed"
  else
    observed_epoch="$(iso_to_epoch "$(jq -r '.observedAt' "$FLEET_RECEIPT_FILE")")"
    if [[ -z "$observed_epoch" ]]; then
      release_block_reason="fleet-receipt-malformed"
    elif (( now_epoch - observed_epoch > FLEET_MAX_AGE_SECONDS || observed_epoch - now_epoch > FLEET_MAX_AGE_SECONDS )); then
      release_block_reason="fleet-receipt-stale"
    elif ! jq -e '.state == "GREEN" and .promotionAdmission.allowed == true' \
        "$FLEET_RECEIPT_FILE" >/dev/null 2>&1; then
      release_block_reason="fleet-gate-not-green:$(jq -r '.state // "unknown"' "$FLEET_RECEIPT_FILE")"
    else
      release_allowed=1
    fi
  fi

  if [[ "$release_allowed" != "1" ]]; then
    echo "  ~ release disabled: ${release_block_reason}; every queue-deferred hold stays in place"
  else
    echo "  ✓ fresh GREEN fleet receipt; evaluating candidates"
    while read -r pr; do
      [[ -z "$pr" ]] && continue
      n=$(jq -r '.n' <<<"$pr")
      t=$(jq -r '.t' <<<"$pr")
      expected_head=$(jq -r '.oid' <<<"$pr")
      expected_branch=$(jq -r '.head' <<<"$pr")
      echo "  #$n  $t"

      receipt="$(deferral_receipt_for_pr "$n")"
      if [[ -z "$receipt" ]]; then
        echo "    ~ untyped hold (no valid ${DEFERRAL_MARKER} receipt); never released automatically"
        continue
      fi
      if ! classification="$(node "$LIB" classify <<<"$receipt")"; then
        echo "    ~ ${classification}"
        continue
      fi
      receipt_head="$(jq -r '.head' <<<"$receipt")"
      if [[ "$receipt_head" != "$expected_head" ]]; then
        echo "    ~ deferral-receipt-head-stale (receipt=${receipt_head:0:12}, live=${expected_head:0:12}); a fresh receipt is required"
        continue
      fi

      attempt_age_m="$(last_attempt_age_minutes "$n")"
      if [[ -n "$attempt_age_m" && "$attempt_age_m" -lt "$ATTEMPT_COOLDOWN_MINUTES" ]]; then
        echo "    ~ last attempt ${attempt_age_m}m ago (< ${ATTEMPT_COOLDOWN_MINUTES}m cooldown); skipping"
        continue
      fi

      # The list snapshot is discovery only. Re-read exact head, draft bit,
      # mergeability, and live labels before consulting checks.
      if ! before="$(read_state "$n" 2>/dev/null)"; then
        echo "    ~ could not read live PR state; leaving hold"
        continue
      fi
      if ! state_is_releasable "$before" "$expected_head" "$expected_branch"; then
        echo "    ~ live state no longer matches the releasable snapshot; leaving hold"
        continue
      fi

      fail="$(check_failures_for_pr "$n")"
      if [[ "$(jq 'length' <<<"$fail")" -ne 0 ]]; then
        echo "    ~ required checks are not exact-head green: $(jq -r 'join(", ")' <<<"$fail")"
        continue
      fi

      # Checks and labels can race the API calls above; this second snapshot is
      # the actual mutation precondition.
      if ! before_mutation="$(read_state "$n" 2>/dev/null)"; then
        echo "    ~ could not re-read live PR state before mutation; leaving hold"
        continue
      fi
      if ! state_is_releasable "$before_mutation" "$expected_head" "$expected_branch"; then
        echo "    ~ head, labels, or state changed before mutation; leaving hold"
        continue
      fi

      was_draft="$(jq -r '.draft' <<<"$before_mutation")"
      if ! remove_hold_label "$n"; then
        upsert_status_comment "$n" "⚠️ Queue-deferred release: checks green and fleet gate GREEN, but removing the \`queue-deferred\` label **failed**. Will retry in ${ATTEMPT_COOLDOWN_MINUTES}m. _(last attempt: $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
        continue
      fi
      if [[ "$was_draft" == "true" ]]; then
        if ! mark_ready "$n"; then
          restore_hold_label "$n" || true
          upsert_status_comment "$n" "⚠️ Queue-deferred release: the hold label was removed but marking the PR ready **failed**, so the hold was restored. Will retry in ${ATTEMPT_COOLDOWN_MINUTES}m. _(last attempt: $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
          continue
        fi
      fi

      [[ "$DRY_RUN" == "1" ]] && continue

      # Verify exact head and live labels after the mutation. If a hold label
      # or new head raced the promotion, restore the hold (and draft status)
      # immediately so the now-unproven revision cannot be enrolled.
      if ! after="$(read_state "$n" 2>/dev/null)"; then
        [[ "$was_draft" == "true" ]] && { gh_retry pr ready "$n" -R "$REPO" --undo >/dev/null 2>&1 || true; }
        restore_hold_label "$n" || true
        upsert_status_comment "$n" "⚠️ Queue-deferred release: the release could not be verified, so a compensating hold restore was attempted. Re-run after the current head and labels stabilize. _(last attempt: $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
        continue
      fi

      head_after="$(jq -r '.head // ""' <<<"$after")"
      draft_after="$(jq -r '.draft' <<<"$after")"
      state_after="$(jq -r '.state // "UNKNOWN"' <<<"$after")"
      held_after="$(jq -r '[.labels[] | select(. == "queue-deferred" or . == "needs-human" or . == "hold" or . == "gated" or . == "fast" or . == "needs-conflict-resolution")] | join(",")' <<<"$after")"

      if [[ "$state_after" == "OPEN" && "$draft_after" == "false" && "$head_after" == "$expected_head" && -z "$held_after" ]]; then
        reason="$(jq -r '.reason' <<<"$receipt")"
        upsert_status_comment "$n" "🤖 Queue-deferred release: typed hold (\`${reason}\`) lifted under a fresh GREEN fleet receipt with all required checks passing — PR is ready for review; the merge-queue controller revalidates this exact head before enrollment. _(verified at $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
      else
        [[ "$was_draft" == "true" && "$draft_after" == "false" ]] && { gh_retry pr ready "$n" -R "$REPO" --undo >/dev/null 2>&1 || true; }
        restore_hold_label "$n" || true
        upsert_status_comment "$n" "⚠️ Queue-deferred release: the PR changed during release (head=\`${head_after:0:12}\`, holds=\`${held_after:-none}\`, state=${state_after}, draft=${draft_after}), so the hold was restored. Re-run checks on the live head before releasing again. _(last attempt: $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
      fi
    done <<<"$CANDIDATES"
  fi
fi

echo "=== done (DRY_RUN=$DRY_RUN RELEASE_MODE=$RELEASE_MODE) ==="
