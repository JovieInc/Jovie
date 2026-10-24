#!/usr/bin/env bash
# Auto-Ready green-source drafts
#
# Event-driven undraft for open main drafts whose required source checks are
# SUCCESS and mergeability is CLEAN (or UNSTABLE with only advisory noise). This restores the July wake that died
# when auto-ready-agent-drafts.yml became workflow_dispatch-only.
#
# This controller never enables native auto-merge and never enrolls the merge
# queue. Auto-Enroll / jovie-bot own admission after ready_for_review.
# All wakes require persisted exact-head, author-owned proof.
#
# Never mutates HOLD #17156. Tim/machine hold labels (GREEN_SOURCE_HOLD_LABELS)
# cover other open holds — do not keep merged/closed PR numbers here.
#
# Env:
#   DRY_RUN=1                 classify and print only; flip no PRs
#   TARGET_PR                 optional exact PR number
#   TARGET_HEAD               optional exact 40-character head SHA
#   MISSED_COHORT             extra already-green drafts to consider (default 0)
#   RUN_OFFSET                cohort rotation offset (workflow run number)
set -euo pipefail

# shellcheck source=./scripts/lib/gh-retry.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/gh-retry.sh"

REPO="${REPO:-JovieInc/Jovie}"
DRY_RUN="${DRY_RUN:-0}"
TARGET_PR="${TARGET_PR:-}"
TARGET_HEAD="${TARGET_HEAD:-}"
MISSED_COHORT="${MISSED_COHORT:-0}"
RUN_OFFSET="${RUN_OFFSET:-0}"
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
    -f query='query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){isDraft headRefOid headRefName baseRefName body title author{login} state mergeable mergeStateStatus labels(first:100){nodes{name}} timelineItems(last:50,itemTypes:[CONVERT_TO_DRAFT_EVENT,PULL_REQUEST_COMMIT,HEAD_REF_FORCE_PUSHED_EVENT]){nodes{__typename ... on ConvertToDraftEvent{createdAt} ... on PullRequestCommit{commit{committedDate}} ... on HeadRefForcePushedEvent{createdAt}}}}}}' \
    -f owner="$owner" \
    -f name="$name" \
    -F number="$n" \
    --jq '.data.repository.pullRequest | {
      draft: .isDraft,
      head: ((.headRefOid // "") | ascii_downcase),
      branch: .headRefName,
      base: .baseRefName,
      body: (.body // ""),
      authorLogin: .author.login,
      title: (.title // ""),
      labels: [.labels.nodes[].name],
      state: .state,
      mergeable: .mergeable,
      mergeStateStatus: .mergeStateStatus,
      # Converted to draft after the last push: a deliberate park.
      parkedDraft: (
        ([.timelineItems.nodes[]? | select(.__typename == "ConvertToDraftEvent") | .createdAt] | max) as $parked
        | ([.timelineItems.nodes[]? | (.commit.committedDate // (select(.__typename == "HeadRefForcePushedEvent") | .createdAt))] | max) as $pushed
        | ($parked != null and ($pushed == null or $parked > $pushed))
      )
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
      parkedDraft: ($state.parkedDraft == true),
      labels: $state.labels,
      title: $state.title,
      branch: $state.branch,
      body: $state.body,
      authorLogin: $state.authorLogin,
      checks: $checks
    }' | node "$CLASSIFY_LIB" classify
}

undo_ready() {  # undo_ready <num> <expected-head>
  local n="$1" expected_head="$2" current
  current="$(read_state "$n" 2>/dev/null)" || return 1
  # Compensation must not change a newer author's head.
  jq -e --arg head "$expected_head" '.state == "OPEN" and .head == $head' <<<"$current" >/dev/null || return 1
  if ! gh pr ready "$n" -R "$REPO" --undo >/dev/null 2>&1; then
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
  # Pin discovery too: a missed-cohort wake cannot follow a replacement head.
  expected_head="${expected_head:-$(jq -r '.head' <<<"$before")}"
  # State-only screen first: a ready, held, conflicting or non-main PR (most
  # wakes) is rejected without spending a second API read on its checks.
  verdict="$(classify_live "$n" "$before" '[]' "$expected_head")"
  if [[ "$(jq -r '.reason' <<<"$verdict")" != checks:* ]]; then
    echo "    ~ green-source $(jq -r '.reason' <<<"$verdict"); leaving PR unchanged"
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

  # Ready has no expected-head CAS. Never replay an uncertain mutation against
  # a head that may have advanced while a transport retry was sleeping.
  if ! gh pr ready "$n" -R "$REPO" >/dev/null 2>&1; then
    echo "    !! failed to mark #$n ready"
    upsert_status_comment "$n" "⚠️ Auto-ready green-source: undraft failed on the exact head. Auto-Enroll was not invoked. _(last attempt: $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
    return 1
  fi

  local after
  if ! after="$(read_state "$n" 2>/dev/null)"; then
    if ! undo_ready "$n" "$live_head"; then
      upsert_status_comment "$n" "🚨 Auto-ready green-source: post-undraft state was unreadable and fail-closed draft restoration could not be verified. _(failed at $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
      return 2
    fi
    upsert_status_comment "$n" "⚠️ Auto-ready green-source: undraft could not be verified, so the PR was restored to draft. _(last attempt: $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
    return 1
  fi

  local head_after draft_after state_after held_after merge_after proof_after
  head_after="$(jq -r '.head // ""' <<<"$after")"
  draft_after="$(jq -r '.draft' <<<"$after")"
  state_after="$(jq -r '.state // "UNKNOWN"' <<<"$after")"
  merge_after="$(jq -r '.mergeStateStatus // "UNKNOWN"' <<<"$after")"
  held_after="$(jq -r --arg hold_re "$HOLD_LABEL_RE" '[.labels[] | select(test($hold_re))] | join(",")' <<<"$after")"
  proof_after="$(jq --argjson prNumber "$n" '. + {headSha: .head, prNumber: $prNumber}' <<<"$after" | node "$SCRIPT_DIR/lib/auto-ready-provenance.mjs" classify)"

  if [[ "$state_after" != "OPEN" ]]; then
    upsert_status_comment "$n" "🤖 Auto-ready green-source: the exact head reached terminal state=${state_after} during verification. _(verified at $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
    return 0
  fi
  # Mergeability was proven on this exact head before mutation. Leaving draft
  # wakes new (often advisory) checks, so a transient BLOCKED/UNSTABLE here is
  # expected and must not trigger a re-draft loop.
  if [[ "$draft_after" == "false" && "$head_after" == "$live_head" && -z "$held_after" && "$(jq -r '.eligible' <<<"$proof_after")" == "true" ]]; then
    echo "    ✓ marked #$n ready; Auto-Enroll owns queue admission"
    upsert_status_comment "$n" "🤖 Auto-ready green-source: marked ready after PR Ready + required checks SUCCESS and mergeable CLEAN. Auto-Enroll / jovie-bot own queue admission. _(verified at $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
    return 0
  fi

  if ! undo_ready "$n" "$live_head"; then
    upsert_status_comment "$n" "🚨 Auto-ready green-source: verification failed and fail-closed draft restoration could not be verified. _(failed at $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
    return 2
  fi
  upsert_status_comment "$n" "⚠️ Auto-ready green-source: verification failed (head=\`${head_after:0:12}\`, holds=\`${held_after:-none}\`, merge=\`${merge_after}\`), so the PR was restored to draft. _(last attempt: $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
  return 1
}

read_missed_snapshot() {
  # gh pr list requests 100 mergeability records per GraphQL page. That query
  # exceeds GitHub's resource limit on busy repositories. Keep the same 200-PR
  # discovery bound, but read at most 20 records per call. No partial snapshot
  # reaches cohort selection if any page fails.
  local owner="${REPO%%/*}" name="${REPO#*/}"
  local cursor="" page snapshot='[]' batch
  for ((batch=0; batch<10; batch++)); do
    local cursor_args=()
    [[ -n "$cursor" ]] && cursor_args=(-f endCursor="$cursor")
    page="$(gh_retry api graphql \
      -f query='query($owner:String!,$name:String!,$endCursor:String){repository(owner:$owner,name:$name){pullRequests(first:20,after:$endCursor,states:OPEN,orderBy:{field:CREATED_AT,direction:DESC}){nodes{number isDraft title headRefName baseRefName mergeable mergeStateStatus labels(first:100){nodes{name}}} pageInfo{hasNextPage endCursor}}}}' \
      -f owner="$owner" -f name="$name" "${cursor_args[@]}" \
      --jq '.data.repository.pullRequests')" || return 1
    snapshot="$(jq -c --argjson page "$page" '. + [$page.nodes[] | .labels = .labels.nodes]' <<<"$snapshot")" || return 1
    if [[ "$(jq -r '.pageInfo.hasNextPage' <<<"$page")" != "true" ]]; then
      break
    fi
    cursor="$(jq -er '.pageInfo.endCursor' <<<"$page")" || return 1
  done
  printf '%s\n' "$snapshot"
}

resolve_head_pr() {  # resolve_head_pr <sha>
  # One REST read of the PRs that own this exact commit, instead of listing
  # every open PR per event (the shared API budget is the bottleneck).
  # The association for a SHA does not change. A later wake reads the cached
  # numbers and spends no installation REST. Empty results are not cached.
  local sha="$1"
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || return 1
  local cache=""
  if [[ -n "${HEAD_PR_CACHE_DIR:-}" ]]; then
    cache="${HEAD_PR_CACHE_DIR}/${sha}"
    if [[ -s "$cache" ]]; then
      echo "  head-pr cache hit ${sha:0:12}" >&2
      cat "$cache"
      return 0
    fi
  fi
  local numbers
  numbers="$(
    gh_retry api "repos/${REPO}/commits/${sha}/pulls" --jq "
      .[]
      | select(.state == \"open\")
      | select(.base.ref == \"main\")
      | select(((.head.sha // \"\") | ascii_downcase) == \"${sha}\")
      | .number
    "
  )" || return 1
  if [[ -n "$cache" && -n "$numbers" ]]; then
    mkdir -p "$HEAD_PR_CACHE_DIR"
    printf '%s\n' "$numbers" >"$cache"
  fi
  if [[ -n "$numbers" ]]; then
    printf '%s\n' "$numbers"
  fi
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
  echo "=== MISSED COHORT: up to $MISSED_COHORT already-green drafts (offset $RUN_OFFSET) ==="
  SNAP="$(read_missed_snapshot)"
  mapfile -t cohort < <(node "$CLASSIFY_LIB" cohort "$MISSED_COHORT" "$RUN_OFFSET" "${TARGET_PR:-0}" <<<"$SNAP")
  for n in "${cohort[@]}"; do
    [[ -z "$n" ]] && continue
    echo "  missed candidate #$n"
    missed_status=0
    undraft_if_eligible "$n" || missed_status=$?
    if [[ "$missed_status" -eq 2 ]]; then
      exit 2
    fi
  done
fi

echo "=== done (DRY_RUN=$DRY_RUN) ==="
