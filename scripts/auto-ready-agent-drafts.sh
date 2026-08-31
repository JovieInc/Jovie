#!/usr/bin/env bash
# Auto-Ready Agent Drafts
#
# Promotes only trusted bot-created drafts, or exact current heads produced
# by the trusted FX writer. Branch-name prefixes are discovery noise, never
# authorization. The only valid promotion pairs `ready` and native auto-merge
# intent in one bounded action. Existing source checks may still be pending;
# GitHub keeps the merge blocked until they pass.
#
# Opt out per-PR with taste/security/hold labels, controlled-proof/canary
# markers, or any of: needs-human, hold, gated, queue-deferred, fast.
#
# Env:
#   DRY_RUN=1                 classify and print only; flip no PRs
set -euo pipefail

# shellcheck source=./scripts/lib/gh-retry.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/gh-retry.sh"

REPO="${REPO:-JovieInc/Jovie}"
DRY_RUN="${DRY_RUN:-0}"
SCRIPT_DIR="$(dirname "${BASH_SOURCE[0]}")"
PROVENANCE_LIB="$SCRIPT_DIR/lib/auto-ready-provenance.mjs"
# Idempotency guard (#13342): one marker comment per PR, edited in place.
# Per-pass mutation is bounded below; there is no workflow sleep or cooldown.
READY_MARKER="auto-ready"
HOLD_LABEL_RE="$(node "$PROVENANCE_LIB" hold-re)"

# Mutation budget: the paired ready + native auto-merge request runs at most
# once per PR per controller pass. If auto-merge cannot be enabled after the
# ready transition, restore draft state so ready-without-auto-merge is never a
# controller-produced terminal state.
promote_with_auto_merge() {  # promote_with_auto_merge <num> <expected-head>
  local n="$1"
  local expected_head="$2"
  if [[ ! "$expected_head" =~ ^[0-9a-f]{40}$ ]]; then
    echo "    !! refusing promotion without an exact head SHA"
    return 1
  fi
  if [[ "${READY_ATTEMPTED_FOR:-}" == "$n" ]]; then
    echo "    !! refusing a second paired promotion for #$n in this pass"
    return 1
  fi
  READY_ATTEMPTED_FOR="$n"
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "    [dry-run] would mark #$n ready and enable native auto-merge"
    return 0
  fi

  if ! gh_retry pr ready "$n" -R "$REPO" >/dev/null 2>&1; then
    echo "    !! failed to mark #$n ready; auto-merge was not requested"
    return 1
  fi
  if gh_retry pr merge "$n" -R "$REPO" --auto --squash \
    --match-head-commit "$expected_head" >/dev/null 2>&1; then
    echo "    ✓ marked #$n ready and enabled native auto-merge"
    return 0
  fi

  echo "    !! auto-merge request failed after ready; restoring #$n to draft"
  undo_ready "$n" || true
  return 1
}

# Upsert the single auto-ready status comment (edited in place on repeat runs).
upsert_status_comment() {  # upsert_status_comment <num> <body>
  [[ "$DRY_RUN" == "1" ]] && { echo "    [dry-run] would upsert status comment on #$1"; return 0; }
  GITHUB_REPOSITORY="$REPO" bash "$(dirname "${BASH_SOURCE[0]}")/lib/upsert-pr-comment.sh" "$1" "$READY_MARKER" "$2" \
    && echo "    ✓ upserted status comment on #$1" || echo "    !! failed to upsert status comment on #$1"
}

# Read mutation-critical fields in one API snapshot. Discovery is never
# authorization: every promotion is pinned to this exact head and live labels.
read_state() {  # read_state <num>
  local n="$1"
  local owner="${REPO%%/*}"
  local name="${REPO#*/}"
  [[ -n "$owner" && -n "$name" && "$owner" != "$name" ]]
  gh_retry api graphql \
    -f query='query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){isDraft headRefOid headRefName state autoMergeRequest{enabledAt} isInMergeQueue mergeQueueEntry{id} labels(first:100){nodes{name}}}}}' \
    -f owner="$owner" \
    -f name="$name" \
    -F number="$n" \
    --jq '.data.repository.pullRequest | {draft: .isDraft, head: ((.headRefOid // "") | ascii_downcase), branch: .headRefName, labels: [.labels.nodes[].name], state: .state, autoMerge: (.autoMergeRequest != null), queued: (.isInMergeQueue == true or .mergeQueueEntry != null)}'
}

state_is_eligible_draft() {  # state_is_eligible_draft <json> <expected-head> <expected-branch>
  jq -e --arg expected_head "$2" --arg expected_branch "$3" --arg hold_re "$HOLD_LABEL_RE" '
    .state == "OPEN"
    and .draft == true
    and .head == $expected_head
    and .branch == $expected_branch
    and ([.labels[] | select(test($hold_re))] | length == 0)
  ' <<<"$1" >/dev/null
}

undo_ready() {  # undo_ready <num> — fail closed and verify the compensation
  local n="$1"
  gh_retry pr merge "$n" -R "$REPO" --disable-auto >/dev/null 2>&1 || true
  if ! gh_retry pr ready "$n" -R "$REPO" --undo >/dev/null 2>&1; then
    echo "    !! compensating draft restore failed for #$n"
    return 1
  fi

  local restored
  if ! restored="$(read_state "$n" 2>/dev/null)"; then
    echo "    !! could not verify compensating draft restore for #$n"
    return 1
  fi
  if jq -e '.state != "OPEN" or (.draft == true and .autoMerge == false and .queued == false)' <<<"$restored" >/dev/null; then
    echo "    ✓ compensated: restored #$n to draft"
    return 0
  fi

  echo "    !! #$n remained ready after compensating draft restore"
  return 1
}

fetch_head_commit() {  # fetch_head_commit <sha>
  gh_retry api "repos/${REPO}/commits/${1}" --jq '{
    sha: (.sha // "" | ascii_downcase),
    message: (.commit.message // ""),
    parentShas: [(.parents // [])[].sha | ascii_downcase],
    authorName: (.commit.author.name // ""),
    authorEmail: (.commit.author.email // ""),
    authorLogin: (.author.login // ""),
    committerName: (.commit.committer.name // ""),
    committerEmail: (.commit.committer.email // ""),
    committerLogin: (.committer.login // ""),
    verified: (.commit.verification.verified // false)
  }'
}

fetch_fx_run() {  # fetch_fx_run <parent-sha>
  gh_retry api "repos/${REPO}/actions/workflows/rolling-ci-dispatch.yml/runs?head_sha=${1}&status=completed&per_page=10" --jq '
    [.workflow_runs[]
      | select(.conclusion == "success")
      | select((.path // "") | test("rolling-ci-dispatch\\.yml$"))
      | {
          workflowPath: (.path // ""),
          workflowName: (.name // ""),
          conclusion: .conclusion,
          event: (.event // ""),
          actorLogin: (.actor.login // ""),
          headSha: ((.head_sha // "") | ascii_downcase)
        }
    ] | first // null'
}

classify_promotion() {  # classify_promotion <json>
  node "$PROVENANCE_LIB" classify <<<"$1"
}

build_promotion_input() {  # build_promotion_input <author> <title> <branch> <labels-json> <head> [commit-json] [fx-run-json]
  local author="$1" title="$2" branch="$3" labels_json="$4" head="$5"
  local commit_json="${6:-null}"
  local fx_run_json="${7:-null}"
  jq -nc \
    --arg author "$author" \
    --arg title "$title" \
    --arg branch "$branch" \
    --argjson labels "$labels_json" \
    --arg head "$head" \
    --argjson commit "$commit_json" \
    --argjson fxRun "$fx_run_json" \
    '{
      authorLogin: $author,
      title: $title,
      branch: $branch,
      labels: $labels,
      headSha: $head,
      commit: $commit,
      fxRun: $fxRun
    }'
}

resolve_promotion() {  # resolve_promotion <author> <title> <branch> <labels-json> <head>
  local author="$1" title="$2" branch="$3" labels_json="$4" head="$5"
  local input verdict reason commit_json fx_run_json trailer
  input="$(build_promotion_input "$author" "$title" "$branch" "$labels_json" "$head")"
  verdict="$(classify_promotion "$input")"
  reason="$(jq -r '.reason' <<<"$verdict")"
  if [[ "$(jq -r '.eligible' <<<"$verdict")" == "true" || "$reason" != "commit-provenance-required" ]]; then
    echo "$verdict"
    return 0
  fi
  if ! commit_json="$(fetch_head_commit "$head" 2>/dev/null)"; then
    jq -nc '{eligible:false, reason:"commit-unavailable"}'
    return 0
  fi
  trailer="$(jq -r '.message // ""' <<<"$commit_json" | node "$PROVENANCE_LIB" trailer | tr -d '[:space:]')"
  fx_run_json="null"
  if [[ -n "$trailer" ]]; then
    fx_run_json="$(fetch_fx_run "$trailer" 2>/dev/null || echo null)"
    [[ -z "$fx_run_json" ]] && fx_run_json="null"
  fi
  input="$(build_promotion_input "$author" "$title" "$branch" "$labels_json" "$head" "$commit_json" "$fx_run_json")"
  classify_promotion "$input"
}

echo "=== AUTO-READY: scanning trusted-bot and FX-repaired drafts ==="

SNAP="$(gh_retry pr list -R "$REPO" --state open --limit 200 \
  --json number,title,isDraft,labels,headRefName,headRefOid,author --jq '
  [ .[] | {
    n: .number,
    t: .title,
    draft: .isDraft,
    head: .headRefName,
    oid: ((.headRefOid // "") | ascii_downcase),
    author: (.author.login // ""),
    L: [.labels[].name]
  } ]')"

# Pair ready + auto-merge only for provenance-authorized drafts. Branch
# prefixes never authorize; the Node classifier owns bot-author and FX-child
# admission. Pending checks are expected and remain GitHub merge gates.
echo "=== PROMOTE: draft + trusted provenance → ready + native auto-merge ==="
echo "$SNAP" | jq -c --arg hold_re "$HOLD_LABEL_RE" '.[]
  | select(.draft)
  | select([.L[] | select(test($hold_re))] | length == 0)' \
  | while read -r pr; do
    READY_ATTEMPTED_FOR=""
    n=$(jq -r '.n' <<<"$pr"); t=$(jq -r '.t' <<<"$pr")
    expected_head=$(jq -r '.oid' <<<"$pr")
    expected_branch=$(jq -r '.head' <<<"$pr")
    author_login=$(jq -r '.author' <<<"$pr")
    labels_json=$(jq -c '.L' <<<"$pr")
    echo "  #$n  ${t:0:48}"

    snapshot_verdict="$(resolve_promotion "$author_login" "$t" "$expected_branch" "$labels_json" "$expected_head")"
    if [[ "$(jq -r '.eligible' <<<"$snapshot_verdict")" != "true" ]]; then
      echo "    ~ provenance $(jq -r '.reason' <<<"$snapshot_verdict"); leaving draft"
      continue
    fi

    # The list snapshot is discovery only. Re-read the exact head, draft bit,
    # and live labels before mutation.
    if ! before="$(read_state "$n" 2>/dev/null)"; then
      echo "    ~ could not read live PR state; leaving draft"
      continue
    fi
    if ! state_is_eligible_draft "$before" "$expected_head" "$expected_branch"; then
      echo "    ~ live state no longer matches the eligible draft snapshot; leaving draft"
      continue
    fi
    live_labels="$(jq -c '.labels' <<<"$before")"
    live_verdict="$(resolve_promotion "$author_login" "$t" "$expected_branch" "$live_labels" "$expected_head")"
    if [[ "$(jq -r '.eligible' <<<"$live_verdict")" != "true" ]]; then
      echo "    ~ live provenance $(jq -r '.reason' <<<"$live_verdict"); leaving draft"
      continue
    fi

    # Labels and head provenance can change while classification is in flight.
    # This second snapshot is the actual mutation precondition.
    if ! before_mutation="$(read_state "$n" 2>/dev/null)"; then
      echo "    ~ could not re-read live PR state before mutation; leaving draft"
      continue
    fi
    if ! state_is_eligible_draft "$before_mutation" "$expected_head" "$expected_branch"; then
      echo "    ~ head, labels, or draft state changed before mutation; leaving draft"
      continue
    fi
    mutation_labels="$(jq -c '.labels' <<<"$before_mutation")"
    mutation_verdict="$(resolve_promotion "$author_login" "$t" "$expected_branch" "$mutation_labels" "$expected_head")"
    if [[ "$(jq -r '.eligible' <<<"$mutation_verdict")" != "true" ]]; then
      echo "    ~ provenance changed before mutation ($(jq -r '.reason' <<<"$mutation_verdict")); leaving draft"
      continue
    fi

    if ! promote_with_auto_merge "$n" "$expected_head"; then
      upsert_status_comment "$n" "⚠️ Auto-ready: the paired ready + native auto-merge action failed. If ready succeeded but auto-merge did not, the controller attempted to restore draft state. The next source/CI recovery event may retry immediately. _(last attempt: $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
      continue
    fi

    [[ "$DRY_RUN" == "1" ]] && continue

    # Verify exact head, live labels, and auto-merge intent after the paired
    # mutation. If any raced the promotion, restore draft status immediately.
    if ! after="$(read_state "$n" 2>/dev/null)"; then
      undo_ready "$n" || true
      upsert_status_comment "$n" "⚠️ Auto-ready: the ready transition could not be verified, so a compensating draft restore was attempted. Re-run after the current head and labels stabilize. _(last attempt: $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
      continue
    fi

    head_after="$(jq -r '.head // ""' <<<"$after")"
    branch_after="$(jq -r '.branch // ""' <<<"$after")"
    draft_after="$(jq -r '.draft' <<<"$after")"
    state_after="$(jq -r '.state // "UNKNOWN"' <<<"$after")"
    auto_merge_after="$(jq -r '.autoMerge' <<<"$after")"
    queued_after="$(jq -r '.queued' <<<"$after")"
    held_after="$(jq -r --arg hold_re "$HOLD_LABEL_RE" '[.labels[] | select(test($hold_re))] | join(",")' <<<"$after")"

    if [[ "$state_after" == "OPEN" && "$draft_after" == "false" && ( "$auto_merge_after" == "true" || "$queued_after" == "true" ) && "$head_after" == "$expected_head" && "$branch_after" == "$expected_branch" && -z "$held_after" ]]; then
      upsert_status_comment "$n" "🤖 Auto-ready: marked ready and enabled native auto-merge on the exact head. Existing checks may still be pending; GitHub will merge only after they pass. _(verified at $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
    elif [[ "$state_after" == "OPEN" && "$draft_after" == "false" ]]; then
      undo_ready "$n" || true
      upsert_status_comment "$n" "⚠️ Auto-ready: paired promotion verification failed (head=\`${head_after:0:12}\`, holds=\`${held_after:-none}\`, auto-merge=\`${auto_merge_after}\`, queued=\`${queued_after}\`), so the controller attempted to restore draft state. _(last attempt: $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
    else
      upsert_status_comment "$n" "⚠️ Auto-ready: the paired action reported success but verification found state=${state_after}, draft=${draft_after}, auto-merge=${auto_merge_after}, queued=${queued_after}. No queue enrollment was claimed. _(last attempt: $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
    fi
  done

echo "=== done (DRY_RUN=$DRY_RUN) ==="
