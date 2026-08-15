#!/usr/bin/env bash
# Releases mechanical `queue-deferred` holds under a fresh GREEN fleet
# receipt, exact-head green checks, and live same-repo/main PR state.
# Report mode is read-only; release mode removes the label from an
# already-ready PR so native autoenrollment revalidates and owns queue admission.
# Untyped holds (missing receipt) on a ready green PR are lifted — they are
# not a permanent manual trap. Human-policy holds (taste, net-new, outbound)
# stay held. Mutations are re-read and compensated.
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
#                            (default 5; one upserted marker comment per PR)
#   RELEASE_RETRY_FILE       optional path receiving the shortest requested
#                            retry delay in seconds for the workflow wrapper
#   QUEUE_READY_THRESHOLD    test/operator override for queue-pressure release;
#                            defaults to the canonical merge-queue max depth
set -euo pipefail

# shellcheck source=./scripts/lib/gh-retry.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/gh-retry.sh"

REPO="${REPO:-JovieInc/Jovie}"
REPO_OWNER="${REPO%%/*}"
DRY_RUN="${DRY_RUN:-0}"
RELEASE_MODE="${RELEASE_MODE:-both}"
FLEET_RECEIPT_FILE="${FLEET_RECEIPT_FILE:-}"
FLEET_MAX_AGE_SECONDS="${FLEET_MAX_AGE_SECONDS:-600}"
ALARM_MINUTES="${ALARM_MINUTES:-12}"
ATTEMPT_COOLDOWN_MINUTES="${ATTEMPT_COOLDOWN_MINUTES:-5}"
RELEASE_RETRY_FILE="${RELEASE_RETRY_FILE:-}"
DEFERRAL_MARKER='<!-- bot-comment:queue-deferral -->'
RELEASE_STATUS_MARKER="queue-deferral-release-status"
LIB="$(dirname "${BASH_SOURCE[0]}")/lib/queue-deferral-receipt.mjs"
RELEASE_ADMISSION_LIB="$(dirname "${BASH_SOURCE[0]}")/lib/queue-deferred-release-admission.mjs"
# Receipt comments are controller authority, not public-input authority. These
# are the only identities used by the current workflow/Symphony writers.
TRUSTED_DEFERRAL_AUTHORS='["itstimwhite","jovie-bot[bot]"]'
# `queue-deferred` itself is expected; every OTHER hold label blocks release.
# Canonical set lives in queue-deferral-receipt.mjs (taste/net-new/outbound).
OTHER_HOLD_RE="$(node "$LIB" human-policy-re)"
now_epoch="$(date -u +%s)"

request_retry_after() {  # request_retry_after <seconds> — shortest request wins
  local requested="$1" current=""
  [[ "$DRY_RUN" == "1" || -z "$RELEASE_RETRY_FILE" ]] && return 0
  [[ "$requested" =~ ^[1-9][0-9]*$ ]] || return 0
  if [[ -f "$RELEASE_RETRY_FILE" ]]; then
    current="$(tr -d '[:space:]' <"$RELEASE_RETRY_FILE")"
  fi
  if [[ ! "$current" =~ ^[1-9][0-9]*$ || "$requested" -lt "$current" ]]; then
    printf '%s\n' "$requested" >"$RELEASE_RETRY_FILE"
  fi
}

iso_to_epoch() {  # iso_to_epoch <iso> — empty output on unparseable input
  date -u -d "$1" +%s 2>/dev/null \
    || python3 -c "import datetime,sys; print(int(datetime.datetime.fromisoformat(sys.argv[1].replace('Z','+00:00')).timestamp()))" "$1" 2>/dev/null \
    || true
}

read_state() {  # read_state <num> — one API snapshot; discovery is never authorization
  gh_retry pr view "$1" -R "$REPO" \
    --json isDraft,headRefOid,headRefName,headRepositoryOwner,baseRefName,labels,mergeable,state \
    --jq '{draft: .isDraft, head: .headRefOid, branch: .headRefName, headOwner: .headRepositoryOwner.login, base: .baseRefName, labels: [.labels[].name], mergeable: .mergeable, state: .state}'
}

# Live state must still show an open, mergeable PR carrying queue-deferred (and
# no other hold) on the exact expected head/branch.
state_is_releasable() {  # state_is_releasable <json> <expected-head> <expected-branch>
  jq -e --arg expected_head "$2" --arg expected_branch "$3" --arg repo_owner "$REPO_OWNER" --arg other_hold_re "$OTHER_HOLD_RE" '
    .state == "OPEN"
    and .draft == false
    and .head == $expected_head
    and .branch == $expected_branch
    and .headOwner == $repo_owner
    and .base == "main"
    and .mergeable == "MERGEABLE"
    and ([.labels[] | select(. == "queue-deferred")] | length == 1)
    and ([.labels[] | select(test($other_hold_re))] | length == 0)
  ' <<<"$1" >/dev/null
}

# A queue-pressure receipt is not permission to discard the pressure policy.
# Re-run the same ready-count contract immediately before release. This is
# reason-specific: Symphony birth holds do not wait on queue depth once source
# checks and the fleet gate are green.
queue_pressure_allows_release() {  # queue_pressure_allows_release <candidate-pr>
  local candidate="$1" threshold open_prs ready_count
  if [[ -n "${QUEUE_READY_THRESHOLD:-}" ]]; then
    threshold="$QUEUE_READY_THRESHOLD"
  elif ! threshold="$(node "$(dirname "${BASH_SOURCE[0]}")/ci-merge-queue-check.mjs" max-queue-depth 2>/dev/null)"; then
    echo "    ~ queue-pressure policy unavailable; leaving hold"
    return 1
  fi
  if ! [[ "$threshold" =~ ^[1-9][0-9]*$ ]]; then
    echo "    ~ queue-pressure threshold malformed; leaving hold"
    return 1
  fi
  if ! open_prs="$(gh_retry pr list -R "$REPO" --state open --base main --limit 100 \
      --json number,isDraft,mergeStateStatus,labels 2>/dev/null)"; then
    echo "    ~ queue-pressure state unavailable; leaving hold"
    return 1
  fi
  if ! ready_count="$(jq -er --argjson candidate "$candidate" '
      [ .[]
        | select(.number != $candidate)
        | select(.isDraft == false)
        | select(
            (.labels | any(.name == "merge-queue")) or
            (.mergeStateStatus == "CLEAN") or
            (.mergeStateStatus == "UNSTABLE")
          )
      ] | length
    ' <<<"$open_prs" 2>/dev/null)"; then
    echo "    ~ queue-pressure state malformed; leaving hold"
    return 1
  fi
  if (( ready_count >= threshold )); then
    echo "    ~ queue pressure remains high (${ready_count} ready, threshold ${threshold}); leaving hold"
    return 1
  fi
  echo "    ✓ queue pressure relieved (${ready_count} ready, threshold ${threshold})"
}

# Latest valid typed deferral receipt for a PR. Empty output = untyped hold.
deferral_receipt_for_pr() {  # deferral_receipt_for_pr <num>
  local raw body
  raw="$(gh_retry api "repos/${REPO}/issues/${1}/comments" --paginate --slurp \
    2>/dev/null || true)"
  [[ -z "$raw" ]] && return 0
  body="$(jq -r --arg marker "$DEFERRAL_MARKER" \
    --argjson trusted "$TRUSTED_DEFERRAL_AUTHORS" '
      [ .[][]?
        | select(.user.login as $login | $trusted | index($login))
        | select((.body | type == "string") and (.body | contains($marker)))
        | .body
      ] | last // empty
    ' <<<"$raw" 2>/dev/null || true)"
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
    --jq "[.[] | select(.body | contains(\"<!-- bot-comment:${RELEASE_STATUS_MARKER} -->\")) | .updated_at] | last" \
    2>/dev/null | grep -E '^[0-9]{4}-' | tail -n1 || true)"
  [[ -z "$updated_at" || "$updated_at" == "null" ]] && return 0
  updated_epoch="$(iso_to_epoch "$updated_at")"
  [[ -z "$updated_epoch" ]] && return 0
  echo $(( (now_epoch - updated_epoch) / 60 ))
}

upsert_status_comment() {  # upsert_status_comment <num> <body>
  [[ "$DRY_RUN" == "1" ]] && { echo "    [dry-run] would upsert release comment on #$1"; return 0; }
  GITHUB_REPOSITORY="$REPO" bash "$(dirname "${BASH_SOURCE[0]}")/lib/upsert-pr-comment.sh" "$1" "$RELEASE_STATUS_MARKER" "$2" \
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

echo "=== QUEUE-DEFERRED: scanning open queue-deferred PRs ==="

SNAP="$(gh_retry pr list -R "$REPO" --state open --limit 200 \
  --base main \
  --json number,title,isDraft,mergeable,labels,headRefName,headRefOid,headRepositoryOwner,updatedAt --jq '
  [ .[] | {
    n: .number,
    t: (.title[0:48]),
    draft: .isDraft,
    m: .mergeable,
    head: .headRefName,
    oid: .headRefOid,
    owner: .headRepositoryOwner.login,
    updated: .updatedAt,
    L: [.labels[].name]
  } ]')"

CANDIDATES="$(jq -c --arg repo_owner "$REPO_OWNER" '.[]
  | select([.L[]] | any(. == "queue-deferred"))
  | select(.owner == $repo_owner)' <<<"$SNAP")"

if [[ -z "$CANDIDATES" ]]; then
  echo "  (no queue-deferred PRs)"
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
    labels_csv="$(jq -r '.L | join(",")' <<<"$pr")"
    receipt="$(deferral_receipt_for_pr "$n")"
    hold_class="$(printf '%s' "${receipt:-}" | node "$LIB" classify-hold --labels "$labels_csv" || true)"
    if [[ -n "$receipt" ]]; then
      reason="$(jq -r '.reason' <<<"$receipt")"
      deferred_epoch="$(iso_to_epoch "$(jq -r '.deferredAt' <<<"$receipt")")"
    else
      reason="${hold_class:-untyped-ready-hold}"
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
  echo "=== RELEASE: mechanical holds under a fresh GREEN fleet gate ==="

  release_allowed=0
  release_admission_mode=""
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
    else
      release_admission="$(node "$RELEASE_ADMISSION_LIB" fleet <"$FLEET_RECEIPT_FILE" 2>/dev/null || true)"
      if ! jq -e '.allowed == true and (.mode | IN("normal", "deferred-release-only"))' \
          <<<"$release_admission" >/dev/null 2>&1; then
        release_block_reason="$(jq -r '.reason // "fleet-receipt-malformed"' <<<"$release_admission" 2>/dev/null || echo fleet-receipt-malformed)"
      else
        release_allowed=1
        release_admission_mode="$(jq -r '.mode' <<<"$release_admission")"
      fi
    fi
  fi

  if [[ "$release_allowed" != "1" ]]; then
    echo "  ~ release disabled: ${release_block_reason}; every queue-deferred hold stays in place"
  else
    echo "  ✓ fresh fleet release admission (${release_admission_mode}); evaluating candidates"
    while read -r pr; do
      [[ -z "$pr" ]] && continue
      n=$(jq -r '.n' <<<"$pr")
      t=$(jq -r '.t' <<<"$pr")
      expected_head=$(jq -r '.oid' <<<"$pr")
      expected_branch=$(jq -r '.head' <<<"$pr")
      echo "  #$n  $t"

      snapshot_labels="$(jq -r '.L | join(",")' <<<"$pr")"
      receipt="$(deferral_receipt_for_pr "$n")"
      if [[ -n "$receipt" ]]; then
        receipt_pr="$(jq -r '.pr' <<<"$receipt")"
        if [[ "$receipt_pr" != "$n" ]]; then
          echo "    ~ deferral-receipt-pr-mismatch (receipt=#${receipt_pr}, live=#${n}); treating as untyped ready hold"
          receipt=""
        fi
      fi
      if ! classification="$(printf '%s' "${receipt:-}" | node "$LIB" classify-hold --labels "$snapshot_labels")"; then
        echo "    ~ ${classification:-held}"
        continue
      fi
      reason="untyped-ready-hold"
      if [[ -n "$receipt" ]]; then
        reason="$(jq -r '.reason' <<<"$receipt")"
        if [[ "$reason" == "queue-pressure" ]] && ! queue_pressure_allows_release "$n"; then
          continue
        fi
        receipt_head="$(jq -r '.head' <<<"$receipt")"
        if [[ "$receipt_head" != "$expected_head" ]]; then
          echo "    ~ deferral-receipt-head-stale (receipt=${receipt_head:0:12}, live=${expected_head:0:12}); evaluating live head"
        fi
      else
        echo "    ~ untyped hold (no valid ${DEFERRAL_MARKER} receipt); releasing only after fresh controller admission"
      fi

      attempt_age_m="$(last_attempt_age_minutes "$n")"
      if [[ -n "$attempt_age_m" && "$attempt_age_m" -lt "$ATTEMPT_COOLDOWN_MINUTES" ]]; then
        retry_after_seconds=$(( (ATTEMPT_COOLDOWN_MINUTES - attempt_age_m) * 60 ))
        request_retry_after "$retry_after_seconds"
        echo "    ~ last attempt ${attempt_age_m}m ago (< ${ATTEMPT_COOLDOWN_MINUTES}m cooldown); retry requested in ${retry_after_seconds}s"
        continue
      fi

      # The list snapshot is discovery only. Re-read exact head, ready state,
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

      # Write the exact-head release receipt before changing the label. The
      # ensuing App-authored `unlabeled` event can enter the AMBER fallback
      # only when the shared enqueue guard reads this fresh controller receipt.
      # A comment is the durable audit trail; a bare label removal is not
      # enrollment authority.
      if [[ "$DRY_RUN" != "1" ]]; then
        release_receipt="$(node "$RELEASE_ADMISSION_LIB" render \
          --pr "$n" --head "$expected_head" \
          --mode "$release_admission_mode" \
          --reason "$reason" \
          --released-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" 2>/dev/null)" || {
            echo "    !! could not render exact-head release receipt; leaving hold" >&2
            continue
          }
        if ! GITHUB_REPOSITORY="$REPO" bash "$(dirname "${BASH_SOURCE[0]}")/lib/upsert-pr-comment.sh" \
          "$n" "queue-deferred-release" "$release_receipt"; then
          echo "    !! could not persist controller release receipt; leaving hold" >&2
          request_retry_after "$(( ATTEMPT_COOLDOWN_MINUTES * 60 ))"
          continue
        fi
      fi

      # Symphony PRs are born ready and immediately hard-held by this label.
      # The App-authored `unlabeled` event wakes autoenrollment only after the
      # exact-head checks and fleet receipt have passed.
      if ! remove_hold_label "$n"; then
        upsert_status_comment "$n" "⚠️ Queue-deferred release: removing the \`queue-deferred\` label **failed**; the ready PR remains hard-held. Will retry in ${ATTEMPT_COOLDOWN_MINUTES}m. _(last attempt: $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
        request_retry_after "$(( ATTEMPT_COOLDOWN_MINUTES * 60 ))"
        continue
      fi

      [[ "$DRY_RUN" == "1" ]] && continue

      # Verify exact head and live labels after the mutation. If a hold label
      # or new head raced the promotion, restore the hold
      # immediately so the now-unproven revision cannot be enrolled.
      if ! after="$(read_state "$n" 2>/dev/null)"; then
        restore_hold_label "$n" || true
        upsert_status_comment "$n" "⚠️ Queue-deferred release: the release could not be verified, so a compensating hold restore was attempted. Re-run after the current head and labels stabilize. _(last attempt: $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
        request_retry_after "$(( ATTEMPT_COOLDOWN_MINUTES * 60 ))"
        continue
      fi

      head_after="$(jq -r '.head // ""' <<<"$after")"
      draft_after="$(jq -r '.draft' <<<"$after")"
      state_after="$(jq -r '.state // "UNKNOWN"' <<<"$after")"
      held_after="$(jq -r --arg other_hold_re "$OTHER_HOLD_RE" '[.labels[] | select(. == "queue-deferred" or test($other_hold_re))] | join(",")' <<<"$after")"

      if [[ "$state_after" == "OPEN" && "$draft_after" == "false" && "$head_after" == "$expected_head" && -z "$held_after" ]]; then
        upsert_status_comment "$n" "🤖 Queue-deferred release: typed hold (\`${reason}\`) lifted under fresh \`${release_admission_mode}\` controller admission with all required checks passing — the merge-queue controller revalidates this exact head before enrollment. _(verified at $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
      else
        restore_hold_label "$n" || true
        upsert_status_comment "$n" "⚠️ Queue-deferred release: the PR changed during release (head=\`${head_after:0:12}\`, holds=\`${held_after:-none}\`, state=${state_after}, draft=${draft_after}), so the hold was restored. Re-run checks on the live head before releasing again. _(last attempt: $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
        request_retry_after "$(( ATTEMPT_COOLDOWN_MINUTES * 60 ))"
      fi
    done <<<"$CANDIDATES"
  fi
fi

echo "=== done (DRY_RUN=$DRY_RUN RELEASE_MODE=$RELEASE_MODE) ==="
