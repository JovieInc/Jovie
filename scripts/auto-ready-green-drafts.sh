#!/usr/bin/env bash
# Auto-Ready green-source drafts
#
# Event-driven undraft for open main drafts whose required source checks are
# SUCCESS and mergeability is CLEAN. This restores the July wake that died
# when auto-ready-agent-drafts.yml became workflow_dispatch-only.
#
# This controller never enables native auto-merge and never enrolls the merge
# queue. Auto-Enroll / jovie-bot own admission after ready_for_review.
# Writer-owned proof recovery stays in auto-ready-agent-drafts.sh.
#
# Never mutates HOLD #17156. Tim/machine hold labels (GREEN_SOURCE_HOLD_LABELS)
# cover other open holds — do not keep merged/closed PR numbers here.
#
# Env:
#   DRY_RUN=1                 classify and print only; flip no PRs
#   TARGET_PR                 optional exact PR number
#   TARGET_HEAD               optional exact 40-character head SHA
#   MISSED_COHORT             extra already-green drafts to consider (default 0)
set -euo pipefail

# shellcheck source=./scripts/lib/gh-retry.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/gh-retry.sh"

REPO="${REPO:-JovieInc/Jovie}"
DRY_RUN="${DRY_RUN:-0}"
TARGET_PR="${TARGET_PR:-}"
TARGET_HEAD="${TARGET_HEAD:-}"
MISSED_COHORT="${MISSED_COHORT:-0}"
SCRIPT_DIR="$(dirname "${BASH_SOURCE[0]}")"
CLASSIFY_LIB="$SCRIPT_DIR/lib/auto-ready-green-drafts.mjs"
READY_MARKER="auto-ready-green-source"
HOLD_LABEL_RE="$(node "$CLASSIFY_LIB" hold-re)"
PROTECTED_PRS="$(node "$CLASSIFY_LIB" protected)"
READY_ATTEMPTED_FOR=""

is_protected_pr() {
  local n="$1"
  [[ ",$PROTECTED_PRS," == *",$n,"* ]]
}

upsert_status_comment() {  # upsert_status_comment <num> <body>
  [[ "$DRY_RUN" == "1" ]] && { echo "    [dry-run] would upsert status comment on #$1"; return 0; }
  GITHUB_REPOSITORY="$REPO" bash "$SCRIPT_DIR/lib/upsert-pr-comment.sh" "$1" "$READY_MARKER" "$2" \
    && echo "    ✓ upserted status comment on #$1" || echo "    !! failed to upsert status comment on #$1"
}

read_state() {  # read_state <num>
  local n="$1"
  local owner="${REPO%%/*}"
  local name="${REPO#*/}"
  [[ -n "$owner" && -n "$name" && "$owner" != "$name" ]]
  gh_retry api graphql \
    -f query='query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){isDraft headRefOid headRefName baseRefName body title state mergeable mergeStateStatus labels(first:100){nodes{name}}}}}' \
    -f owner="$owner" \
    -f name="$name" \
    -F number="$n" \
    --jq '.data.repository.pullRequest | {
      draft: .isDraft,
      head: ((.headRefOid // "") | ascii_downcase),
      branch: .headRefName,
      base: .baseRefName,
      body: (.body // ""),
      title: (.title // ""),
      labels: [.labels.nodes[].name],
      state: .state,
      mergeable: .mergeable,
      mergeStateStatus: .mergeStateStatus
    }'
}

read_checks() {  # read_checks <num>
  local n="$1"
  local raw_file err_file
  raw_file="$(mktemp)"
  err_file="$(mktemp)"
  # `gh pr checks` exits 8 when checks are pending, even with valid JSON.
  if gh_retry pr checks "$n" -R "$REPO" \
    --json name,bucket,state,workflow,description,startedAt,completedAt \
    >"$raw_file" 2>"$err_file" \
    || jq -e 'type == "array"' "$raw_file" >/dev/null 2>&1; then
    if jq -e 'type == "array"' "$raw_file" >/dev/null 2>&1; then
      cat "$raw_file"
      rm -f "$raw_file" "$err_file"
      return 0
    fi
  fi
  echo "    !! could not read required checks for #$n: $(tr '\n' ' ' <"$err_file")" >&2
  rm -f "$raw_file" "$err_file"
  return 1
}

classify_live() {  # classify_live <num> <json> <checks-json> [expected-head]
  local n="$1" state_json="$2" checks_json="$3" expected_head="${4:-}"
  jq -nc \
    --argjson prNumber "$n" \
    --argjson state "$state_json" \
    --argjson checks "$checks_json" \
    --arg expectedHead "$expected_head" \
    '{
      prNumber: $prNumber,
      state: $state.state,
      draft: $state.draft,
      baseRefName: $state.base,
      headSha: $state.head,
      expectedHeadSha: $expectedHead,
      mergeable: $state.mergeable,
      mergeStateStatus: $state.mergeStateStatus,
      labels: $state.labels,
      title: $state.title,
      branch: $state.branch,
      body: $state.body,
      checks: $checks
    }' | node "$CLASSIFY_LIB" classify
}

undo_ready() {  # undo_ready <num>
  local n="$1"
  if ! gh_retry pr ready "$n" -R "$REPO" --undo >/dev/null 2>&1; then
    echo "    !! compensating draft restore failed for #$n"
    return 1
  fi
  local restored
  if ! restored="$(read_state "$n" 2>/dev/null)"; then
    echo "    !! could not verify compensating draft restore for #$n"
    return 1
  fi
  if jq -e '.state != "OPEN" or .draft == true' <<<"$restored" >/dev/null; then
    echo "    ✓ compensated: restored #$n to draft"
    return 0
  fi
  echo "    !! #$n remained ready after compensating draft restore"
  return 1
}

undraft_if_eligible() {  # undraft_if_eligible <num> [expected-head]
  local n="$1"
  local expected_head="${2:-}"
  if is_protected_pr "$n"; then
    echo "  #$n  protected special; leaving PR unchanged"
    return 0
  fi
  if [[ "${READY_ATTEMPTED_FOR:-}" == "$n" ]]; then
    echo "    ~ already considered #$n in this pass"
    return 0
  fi

  local before checks verdict
  if ! before="$(read_state "$n" 2>/dev/null)"; then
    echo "    ~ could not read live PR state for #$n; leaving PR unchanged"
    return 0
  fi
  if ! checks="$(read_checks "$n")"; then
    echo "    ~ required check status unavailable for #$n; leaving PR unchanged"
    return 0
  fi
  verdict="$(classify_live "$n" "$before" "$checks" "$expected_head")"
  if [[ "$(jq -r '.eligible' <<<"$verdict")" != "true" ]]; then
    echo "    ~ green-source $(jq -r '.reason' <<<"$verdict"); leaving PR unchanged"
    return 0
  fi

  if ! before_mutation="$(read_state "$n" 2>/dev/null)"; then
    echo "    ~ could not re-read live PR state before mutation; leaving PR unchanged"
    return 0
  fi
  if ! checks="$(read_checks "$n")"; then
    echo "    ~ required check status raced before mutation; leaving PR unchanged"
    return 0
  fi
  local mutation_verdict
  mutation_verdict="$(classify_live "$n" "$before_mutation" "$checks" "$expected_head")"
  if [[ "$(jq -r '.eligible' <<<"$mutation_verdict")" != "true" ]]; then
    echo "    ~ provenance changed before mutation ($(jq -r '.reason' <<<"$mutation_verdict")); leaving PR unchanged"
    return 0
  fi

  READY_ATTEMPTED_FOR="$n"
  local live_head
  live_head="$(jq -r '.head' <<<"$before_mutation")"
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "    [dry-run] would mark #$n ready (no auto-merge, no queue enroll)"
    return 0
  fi

  if ! gh_retry pr ready "$n" -R "$REPO" >/dev/null 2>&1; then
    echo "    !! failed to mark #$n ready"
    upsert_status_comment "$n" "⚠️ Auto-ready green-source: undraft failed on the exact head. Auto-Enroll was not invoked. _(last attempt: $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
    return 1
  fi

  local after
  if ! after="$(read_state "$n" 2>/dev/null)"; then
    if ! undo_ready "$n"; then
      upsert_status_comment "$n" "🚨 Auto-ready green-source: post-undraft state was unreadable and fail-closed draft restoration could not be verified. _(failed at $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
      return 2
    fi
    upsert_status_comment "$n" "⚠️ Auto-ready green-source: undraft could not be verified, so the PR was restored to draft. _(last attempt: $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
    return 1
  fi

  local head_after draft_after state_after held_after merge_after
  head_after="$(jq -r '.head // ""' <<<"$after")"
  draft_after="$(jq -r '.draft' <<<"$after")"
  state_after="$(jq -r '.state // "UNKNOWN"' <<<"$after")"
  merge_after="$(jq -r '.mergeStateStatus // "UNKNOWN"' <<<"$after")"
  held_after="$(jq -r --arg hold_re "$HOLD_LABEL_RE" '[.labels[] | select(test($hold_re))] | join(",")' <<<"$after")"

  if [[ "$state_after" != "OPEN" ]]; then
    upsert_status_comment "$n" "🤖 Auto-ready green-source: the exact head reached terminal state=${state_after} during verification. _(verified at $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
    return 0
  fi
  if [[ "$draft_after" == "false" && "$head_after" == "$live_head" && -z "$held_after" && "$merge_after" == "CLEAN" ]]; then
    echo "    ✓ marked #$n ready; Auto-Enroll owns queue admission"
    upsert_status_comment "$n" "🤖 Auto-ready green-source: marked ready after PR Ready + required checks SUCCESS and mergeable CLEAN. Auto-Enroll / jovie-bot own queue admission. _(verified at $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
    return 0
  fi

  if ! undo_ready "$n"; then
    upsert_status_comment "$n" "🚨 Auto-ready green-source: verification failed and fail-closed draft restoration could not be verified. _(failed at $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
    return 2
  fi
  upsert_status_comment "$n" "⚠️ Auto-ready green-source: verification failed (head=\`${head_after:0:12}\`, holds=\`${held_after:-none}\`, merge=\`${merge_after}\`), so the PR was restored to draft. _(last attempt: $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
  return 1
}

resolve_head_pr() {  # resolve_head_pr <sha>
  local sha="$1"
  gh_retry pr list -R "$REPO" --state open --limit 200 \
    --json number,isDraft,headRefOid,baseRefName \
    | jq -r --arg head "$sha" '
      .[]
      | select(.baseRefName == "main")
      | select(((.headRefOid // "") | ascii_downcase) == $head)
      | .number
    '
}

echo "=== AUTO-READY GREEN-SOURCE: event-driven undraft (no queue enroll) ==="
echo "protected=$PROTECTED_PRS DRY_RUN=$DRY_RUN TARGET_PR=${TARGET_PR:-none} TARGET_HEAD=${TARGET_HEAD:-none} MISSED_COHORT=$MISSED_COHORT"

if [[ -n "$TARGET_PR" ]]; then
  if [[ ! "$TARGET_PR" =~ ^[1-9][0-9]*$ ]]; then
    echo "!! TARGET_PR must be a positive integer"
    exit 2
  fi
  if [[ -n "$TARGET_HEAD" && ! "$TARGET_HEAD" =~ ^[0-9a-fA-F]{40}$ ]]; then
    echo "!! TARGET_HEAD must be a 40-character SHA"
    exit 2
  fi
  echo "  event target #$TARGET_PR"
  target_status=0
  undraft_if_eligible "$TARGET_PR" "${TARGET_HEAD,,}" || target_status=$?
  if [[ "$target_status" -eq 2 ]]; then
    exit 2
  fi
elif [[ -n "$TARGET_HEAD" ]]; then
  if [[ ! "$TARGET_HEAD" =~ ^[0-9a-fA-F]{40}$ ]]; then
    echo "!! TARGET_HEAD must be a 40-character SHA"
    exit 2
  fi
  mapfile -t matching < <(resolve_head_pr "${TARGET_HEAD,,}" || true)
  if [[ "${#matching[@]}" -eq 1 ]]; then
    echo "  event head ${TARGET_HEAD:0:12} → #${matching[0]}"
    target_status=0
    undraft_if_eligible "${matching[0]}" "${TARGET_HEAD,,}" || target_status=$?
    if [[ "$target_status" -eq 2 ]]; then
      exit 2
    fi
  elif [[ "${#matching[@]}" -eq 0 ]]; then
    echo "  ~ no open main PR owns head ${TARGET_HEAD:0:12}; considering missed cohort only"
  else
    echo "  ~ ambiguous open main PRs own head ${TARGET_HEAD:0:12}; leaving event target unchanged"
  fi
fi

if [[ "$MISSED_COHORT" =~ ^[1-9][0-9]*$ ]]; then
  echo "=== MISSED COHORT: up to $MISSED_COHORT already-green drafts ==="
  SNAP="$(gh_retry pr list -R "$REPO" --state open --limit 200 \
    --json number,isDraft,labels,headRefName,headRefOid,baseRefName,mergeable,mergeStateStatus --jq '
    [ .[] | select(.isDraft == true) | select(.baseRefName == "main") | {
      n: .number,
      mergeable: .mergeable,
      mergeStateStatus: .mergeStateStatus,
      L: [.labels[].name]
    } ]')"
  considered=0
  while read -r pr; do
    [[ -z "$pr" ]] && continue
    n="$(jq -r '.n' <<<"$pr")"
    if [[ "$considered" -ge "$MISSED_COHORT" ]]; then
      break
    fi
    echo "  missed candidate #$n"
    missed_status=0
    undraft_if_eligible "$n" || missed_status=$?
    if [[ "$missed_status" -eq 2 ]]; then
      exit 2
    fi
    considered=$((considered + 1))
  done < <(echo "$SNAP" | jq -c --arg hold_re "$HOLD_LABEL_RE" --arg protected "$PROTECTED_PRS" --argjson skip "${TARGET_PR:-0}" '
    .[]
    | select(.n != $skip)
    | select(($protected | split(",") | index(.n | tostring)) | not)
    | select([.L[] | select(test($hold_re))] | length == 0)
    | select(.mergeable == "MERGEABLE")
    | select(.mergeStateStatus == "CLEAN")
  ')
fi

echo "=== done (DRY_RUN=$DRY_RUN) ==="
