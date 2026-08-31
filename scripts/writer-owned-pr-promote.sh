#!/usr/bin/env bash
# JOV-INV-022: writer proof + ready + native intent are one bounded action.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/gh-retry.sh"
REPO="${REPO:-${GITHUB_REPOSITORY:-JovieInc/Jovie}}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMOTION_LIB="$SCRIPT_DIR/lib/writer-owned-pr-promotion.mjs"
DRY_RUN="${DRY_RUN:-0}"
usage() { echo "Usage: writer-owned-pr-promote.sh --pr <number> --issue <ticket-id> --head <sha> --writer <github-login> --required-tests <evidence> --review-sweep <evidence> --ticket-evidence <evidence> --pr-evidence <evidence>" >&2; }
PR_NUMBER=""; ISSUE_ID=""; EXPECTED_HEAD=""; WRITER_LOGIN=""; REQUIRED_TESTS=""; REVIEW_SWEEP=""; TICKET_EVIDENCE=""; PR_EVIDENCE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --pr) PR_NUMBER="${2:-}"; shift 2 ;;
    --issue) ISSUE_ID="${2:-}"; shift 2 ;;
    --head) EXPECTED_HEAD="${2:-}"; shift 2 ;;
    --writer) WRITER_LOGIN="${2:-}"; shift 2 ;;
    --required-tests) REQUIRED_TESTS="${2:-}"; shift 2 ;;
    --review-sweep) REVIEW_SWEEP="${2:-}"; shift 2 ;;
    --ticket-evidence) TICKET_EVIDENCE="${2:-}"; shift 2 ;;
    --pr-evidence) PR_EVIDENCE="${2:-}"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done
if [[ ! "$PR_NUMBER" =~ ^[1-9][0-9]*$ || ! "$EXPECTED_HEAD" =~ ^[0-9a-fA-F]{40}$ || -z "$ISSUE_ID" || -z "$WRITER_LOGIN" ]]; then usage; exit 2; fi
EXPECTED_HEAD="${EXPECTED_HEAD,,}"
normalize_login() { printf '%s' "$1" | sed 's/^@//' | tr '[:upper:]' '[:lower:]'; }
upsert_status_comment() {
  [[ "$DRY_RUN" == "1" ]] && { echo "    [dry-run] would upsert writer promotion status on #$PR_NUMBER"; return 0; }
  GITHUB_REPOSITORY="$REPO" bash "$SCRIPT_DIR/lib/upsert-pr-comment.sh" \
    "$PR_NUMBER" "writer-owned-pr-promotion" "$1"
}
read_state() {
  gh_retry api graphql \
    -f query='query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){number state isDraft headRefOid body labels(first:100){nodes{name}} autoMergeRequest{enabledAt} isInMergeQueue mergeQueueEntry{id state position}}}}' \
    -f owner="${REPO%%/*}" -f name="${REPO#*/}" -F number="$PR_NUMBER" \
    --jq '.data.repository.pullRequest | {number, state, draft: .isDraft, head: ((.headRefOid // "") | ascii_downcase), body: (.body // ""), labels: [.labels.nodes[].name], autoMerge: (.autoMergeRequest != null), queued: (.isInMergeQueue == true and .mergeQueueEntry != null), mergeQueueEntry}'
}
blocker_body() {
  jq -nc \
    --arg issueId "$ISSUE_ID" --argjson prNumber "$PR_NUMBER" \
    --arg headSha "$EXPECTED_HEAD" --arg writerLogin "$WRITER_LOGIN" \
    --arg phase "$1" --arg reason "$2" --argjson attempted "$3" \
    --argjson verified "$4" --argjson state "$5" \
    '{issueId:$issueId, prNumber:$prNumber, headSha:$headSha, writerLogin:$writerLogin, phase:$phase, reason:$reason, compensation:{attempted:$attempted, verified:$verified, state:$state}}' \
    | node "$PROMOTION_LIB" render-blocker
}
compensate_to_draft() {
  local state
  gh_retry pr merge "$PR_NUMBER" -R "$REPO" --disable-auto >/dev/null 2>&1 || true
  gh_retry pr ready "$PR_NUMBER" -R "$REPO" --undo >/dev/null 2>&1 || true
  state="$(read_state 2>/dev/null)" || { printf 'null'; return 1; }
  printf '%s' "$state"
  jq -e '.state != "OPEN" or (.draft == true and .autoMerge == false and .queued == false)' <<<"$state" >/dev/null
}
emit_blocker_and_exit() {
  local phase="$1" reason="$2" should_compensate="${3:-0}"
  local attempted=false verified=false state="null" body
  [[ "$should_compensate" == "1" ]] && attempted=true
  if [[ "$should_compensate" == "1" && "$DRY_RUN" != "1" ]] && state="$(compensate_to_draft)"; then
    verified=true
  fi
  body="$(blocker_body "$phase" "$reason" "$attempted" "$verified" "${state:-null}")"
  upsert_status_comment "$body" || true
  echo "writer promotion blocked: $reason" >&2
  exit 2
}
decision_for() {
  jq -nc \
    --argjson receipt "$1" --argjson state "$2" \
    --arg expectedHeadSha "$EXPECTED_HEAD" --arg writerLogin "$WRITER_LOGIN" \
    --argjson prNumber "$PR_NUMBER" \
    '{receipt:$receipt,state:$state,context:{expectedHeadSha:$expectedHeadSha,writerLogin:$writerLogin,prNumber:$prNumber}}' \
    | node "$PROMOTION_LIB" decision
}
before="$(read_state)" || emit_blocker_and_exit "precondition" "state-read-failed" 0
live_head="$(jq -r '.head // ""' <<<"$before")"
[[ "$live_head" == "$EXPECTED_HEAD" ]] || emit_blocker_and_exit "precondition" "head-mismatch:${live_head:-missing}" 0
viewer_login="$(gh_retry api user --jq '.login' 2>/dev/null)" || emit_blocker_and_exit "precondition" "writer-identity-unreadable" 0
if [[ "$(normalize_login "$viewer_login")" != "$(normalize_login "$WRITER_LOGIN")" ]]; then
  emit_blocker_and_exit "precondition" "writer-token-mismatch:${viewer_login:-unknown}" 0
fi
set +e
receipt="$(node "$PROMOTION_LIB" receipt --issue "$ISSUE_ID" --pr "$PR_NUMBER" --head "$EXPECTED_HEAD" --writer "$WRITER_LOGIN" --required-tests "$REQUIRED_TESTS" --review-sweep "$REVIEW_SWEEP" --ticket-evidence "$TICKET_EVIDENCE" --pr-evidence "$PR_EVIDENCE")"
receipt_rc=$?
set -e
decision="$(decision_for "$receipt" "$before")"
action="$(jq -r '.action' <<<"$decision")"
reason="$(jq -r '.reason' <<<"$decision")"
if [[ "$receipt_rc" -ne 0 || "$action" == "block" ]]; then
  current_ready="$(jq -r '.draft == false or .autoMerge == true or .queued == true' <<<"$before")"
  [[ "$current_ready" == "true" ]] && compensate=1 || compensate=0
  emit_blocker_and_exit "proof" "$reason" "$compensate"
fi
[[ "$action" != "compensate" ]] || emit_blocker_and_exit "precondition" "$reason" 1
[[ "$action" == "already-complete" ]] && { echo "writer promotion already complete for #$PR_NUMBER@$EXPECTED_HEAD"; exit 0; }
[[ "$action" == "promote" ]] || emit_blocker_and_exit "precondition" "$reason" 0
current_body="$(jq -r '.body // ""' <<<"$before")"
new_body="$(jq -nc --arg body "$current_body" --argjson receipt "$receipt" '{body:$body,receipt:$receipt}' | node "$PROMOTION_LIB" attach)"
[[ "$DRY_RUN" == "1" ]] && { echo "    [dry-run] would attach writer proof, mark ready, and request native auto-merge on #$PR_NUMBER@$EXPECTED_HEAD"; exit 0; }
gh_retry pr edit "$PR_NUMBER" -R "$REPO" --body "$new_body" >/dev/null || emit_blocker_and_exit "proof-attach" "pr-body-update-failed" 0
gh_retry pr ready "$PR_NUMBER" -R "$REPO" >/dev/null 2>&1 || emit_blocker_and_exit "ready" "gh-pr-ready-failed" 1
gh_retry pr merge "$PR_NUMBER" -R "$REPO" --auto --squash --match-head-commit "$EXPECTED_HEAD" >/dev/null 2>&1 || emit_blocker_and_exit "native-intent" "auto-merge-request-failed" 1
after="$(read_state)" || emit_blocker_and_exit "postcondition" "state-reread-failed" 1
postcondition="$(decision_for "$receipt" "$after")"
if [[ "$(jq -r '.action' <<<"$postcondition")" != "already-complete" ]]; then emit_blocker_and_exit "postcondition" "$(jq -r '.reason' <<<"$postcondition")" 1; fi
upsert_status_comment "Writer-owned PR promotion completed for exact head \`$EXPECTED_HEAD\` using \`jovie-writer-pr-proof/v1\`. Native auto-merge/queue intent was verified in the same bounded operation."
echo "writer promotion complete for #$PR_NUMBER@$EXPECTED_HEAD"
