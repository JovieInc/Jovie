#!/usr/bin/env bash
# Unstack a PR whose parent PR already merged.
#
# A stacked PR targets its parent's head branch. When the parent squash-merges,
# main holds one squash commit while the child still carries the parent's
# original commits. Retargeting the child to main without a rebase re-adds the
# parent diff (and trips PR Size Guard), so this controller:
#
#   1. proves the old base branch belongs to a MERGED parent PR (a closed,
#      unmerged parent is never unstacked: that would land abandoned work);
#   2. rebases only the child's own commits onto main
#      (`git rebase --onto origin/main <parent-head> <child>`);
#   3. pushes with an exact-SHA lease and retargets the base to main;
#   4. restacks open grandchildren onto the rewritten child so a chain stays a
#      chain (they keep their base; only their parent's commits moved).
#
# A conflict aborts the rebase and leaves the branch untouched with a comment;
# the lanes conflict lane owns it from there. Never closes a PR, never enables
# auto-merge, never touches `hold`/`gated` PRs.
#
# Env:
#   REPO           owner/name (default JovieInc/Jovie)
#   CHILD_PR       the stacked PR to unstack (required)
#   OLD_BASE_REF   its former base branch when GitHub already retargeted it to
#                  main after deleting the merged parent branch (optional)
#   DRY_RUN=1      plan and print only; no push, edit or comment
#   GIT_REMOTE     remote name (default origin)
set -euo pipefail

# shellcheck source=./scripts/lib/gh-retry.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/gh-retry.sh"

REPO="${REPO:-JovieInc/Jovie}"
CHILD_PR="${CHILD_PR:-}"
OLD_BASE_REF="${OLD_BASE_REF:-}"
DRY_RUN="${DRY_RUN:-0}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
SCRIPT_DIR="$(dirname "${BASH_SOURCE[0]}")"
MARKER="unstack-merged-parent"
HOLD_RE='^(hold|gated|incident|do-not-merge|tim-hold|tim:hold|hold:tim)$'

if [[ ! "$CHILD_PR" =~ ^[1-9][0-9]*$ ]]; then
  echo "!! CHILD_PR must be a positive integer"
  exit 2
fi

comment() {  # comment <num> <body>
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "    [dry-run] would comment on #$1"
    return 0
  fi
  GITHUB_REPOSITORY="$REPO" bash "$SCRIPT_DIR/lib/upsert-pr-comment.sh" "$1" "$MARKER" "$2" \
    || echo "    !! failed to comment on #$1"
}

pr_state() {  # pr_state <num>
  gh_retry pr view "$1" -R "$REPO" \
    --json number,state,isDraft,isCrossRepository,headRefName,headRefOid,baseRefName,labels \
    --jq '{n: .number, state, cross: .isCrossRepository, head: .headRefName,
           sha: (.headRefOid | ascii_downcase), base: .baseRefName,
           held: ([.labels[].name | select(test("'"$HOLD_RE"'"; "i"))] | length > 0)}'
}

merged_parent() {  # merged_parent <branch> -> "<number> <head-sha>" or empty
  local owner="${REPO%%/*}"
  gh_retry api "repos/${REPO}/pulls?state=closed&head=${owner}:${1}&per_page=20" \
    --jq '[.[] | select(.merged_at != null)] | sort_by(.merged_at) | last
          | if . == null then empty else "\(.number) \(.head.sha | ascii_downcase)" end'
}

# rebase_branch <branch> <old-upstream-sha> <onto-ref> <expected-head-sha>
# Prints the new head SHA. Returns 1 on conflict/empty (branch left untouched).
rebase_branch() {
  local branch="$1" upstream="$2" onto="$3" expected="$4" new_head
  git fetch -q "$GIT_REMOTE" "+refs/heads/${branch}:refs/remotes/${GIT_REMOTE}/${branch}"
  if [[ "$(git rev-parse "${GIT_REMOTE}/${branch}")" != "$expected" ]]; then
    echo "    ~ ${branch} moved since it was read; leaving it" >&2
    return 1
  fi
  git checkout -q -B "unstack/${branch}" "$expected"
  if ! git rebase -q --onto "$onto" "$upstream" >/dev/null 2>&1; then
    git rebase --abort >/dev/null 2>&1 || true
    echo "    ~ rebase of ${branch} onto ${onto} conflicts" >&2
    return 1
  fi
  new_head="$(git rev-parse HEAD)"
  if [[ "$(git rev-list --count "${onto}..${new_head}")" -eq 0 ]]; then
    echo "    ~ ${branch} has no commits left after dropping its parent" >&2
    return 1
  fi
  if [[ "$DRY_RUN" != "1" ]]; then
    git push -q --force-with-lease="refs/heads/${branch}:${expected}" \
      "$GIT_REMOTE" "${new_head}:refs/heads/${branch}"
  fi
  echo "$new_head"
}

git config user.name >/dev/null 2>&1 || git config user.name "jovie-bot[bot]"
git config user.email >/dev/null 2>&1 || git config user.email "jovie-bot[bot]@users.noreply.github.com"

echo "=== UNSTACK: #$CHILD_PR (DRY_RUN=$DRY_RUN) ==="
child="$(pr_state "$CHILD_PR")"
if ! jq -e '.state == "OPEN" and .cross == false and .held == false' <<<"$child" >/dev/null; then
  echo "  ~ #$CHILD_PR is closed, cross-repo or held; leaving it"
  exit 0
fi
child_branch="$(jq -r .head <<<"$child")"
child_sha="$(jq -r .sha <<<"$child")"
child_base="$(jq -r .base <<<"$child")"
old_base="${OLD_BASE_REF:-$child_base}"
if [[ "$old_base" == "main" ]]; then
  echo "  ~ #$CHILD_PR is not stacked; nothing to unstack"
  exit 0
fi

parent="$(merged_parent "$old_base" || true)"
if [[ -z "$parent" ]]; then
  echo "  ~ base ${old_base} has no merged parent PR; leaving #$CHILD_PR stacked"
  exit 0
fi
parent_pr="${parent%% *}"
parent_sha="${parent##* }"
echo "  parent #$parent_pr merged; dropping commits up to ${parent_sha:0:12}"

git fetch -q "$GIT_REMOTE" main "+refs/pull/${parent_pr}/head:refs/remotes/${GIT_REMOTE}/pull/${parent_pr}" \
  "+refs/heads/${child_branch}:refs/remotes/${GIT_REMOTE}/${child_branch}"
onto="${GIT_REMOTE}/main"
# Our own retarget emits the same `edited` wake. A child that no longer carries
# the parent tip was already unstacked; rebasing it again would misreport a
# conflict (or replay commits) on a branch that is already correct.
if ! git merge-base --is-ancestor "$parent_sha" "$child_sha" 2>/dev/null; then
  echo "  ~ #$CHILD_PR no longer carries parent #$parent_pr; already unstacked"
  exit 0
fi
if ! new_child="$(rebase_branch "$child_branch" "$parent_sha" "$onto" "$child_sha")"; then
  comment "$CHILD_PR" "🤖 Unstack: parent #${parent_pr} merged, but rebasing \`${child_branch}\` onto \`main\` without the parent's commits did not apply cleanly. The branch is unchanged; the conflict lane owns it next. _(at $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
  exit 0
fi
echo "  ✓ rebased #$CHILD_PR: ${child_sha:0:12} -> ${new_child:0:12}"
if [[ "$child_base" != "main" && "$DRY_RUN" != "1" ]]; then
  gh_retry pr edit "$CHILD_PR" -R "$REPO" --base main >/dev/null
fi
echo "  ✓ #$CHILD_PR targets main"
comment "$CHILD_PR" "🤖 Unstack: parent #${parent_pr} merged, so this PR was rebased onto \`main\` with only its own commits (\`${child_sha:0:12}\` → \`${new_child:0:12}\`) and now targets \`main\`. _(at $(date -u +%Y-%m-%dT%H:%M:%SZ))_"

# Restack the chain: each open PR based on a rewritten branch moves its own
# commits from the old branch tip onto the new one and keeps its base.
queue=("${child_branch} ${child_sha} ${new_child}")
while [[ "${#queue[@]}" -gt 0 ]]; do
  read -r branch old_tip new_tip <<<"${queue[0]}"
  queue=("${queue[@]:1}")
  while read -r grandchild; do
    [[ -z "$grandchild" ]] && continue
    gc="$(pr_state "$grandchild")"
    if ! jq -e '.state == "OPEN" and .cross == false and .held == false' <<<"$gc" >/dev/null; then
      continue
    fi
    gc_branch="$(jq -r .head <<<"$gc")"
    gc_sha="$(jq -r .sha <<<"$gc")"
    if gc_new="$(rebase_branch "$gc_branch" "$old_tip" "$new_tip" "$gc_sha")"; then
      echo "  ✓ restacked #$grandchild on ${branch}: ${gc_sha:0:12} -> ${gc_new:0:12}"
      comment "$grandchild" "🤖 Unstack: its parent \`${branch}\` was rebased onto \`main\` after #${parent_pr} merged, so this PR was restacked on the new parent tip with only its own commits (\`${gc_sha:0:12}\` → \`${gc_new:0:12}\`). _(at $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
      queue+=("${gc_branch} ${gc_sha} ${gc_new}")
    else
      comment "$grandchild" "🤖 Unstack: its parent \`${branch}\` was rebased onto \`main\` after #${parent_pr} merged, but restacking this PR on the new parent tip conflicted. The branch is unchanged. _(at $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
    fi
  done < <(gh_retry pr list -R "$REPO" --state open --base "$branch" --limit 50 --json number --jq '.[].number')
done

echo "=== done (DRY_RUN=$DRY_RUN) ==="
