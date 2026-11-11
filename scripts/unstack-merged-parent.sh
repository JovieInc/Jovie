#!/usr/bin/env bash
# Unstack a PR whose parent PR already merged.
#
# A stacked PR targets its parent's head branch. When the parent squash-merges,
# main holds one squash commit while the child still carries the parent's
# original commits. Retargeting the child to main without a rebase re-adds the
# parent diff (and trips PR Size Guard), so this controller:
#
#   1. proves the old base branch belongs to a parent PR MERGED into main (a closed,
#      unmerged parent is never unstacked: that would land abandoned work);
#   2. rebases only the child's own commits onto main
#      (`git rebase --onto origin/main <parent-head> <child>`);
#   3. pushes with an exact-SHA lease and retargets the base to main;
#   4. restacks open grandchildren onto the rewritten child so a chain stays a
#      chain (they keep their base; only their parent's commits moved).
#
# A conflict aborts the rebase and leaves the branch untouched with a comment;
# the lanes conflict lane owns it from there. Never closes a PR, never touches
# `hold`/`gated` PRs, never arms auto-merge or enqueues itself: Merge Queue
# Green Enroll is the only queue writer (admission-hold-labels.test.mjs). With
# ADMIT_AFTER_UNSTACK=1 the unstacked child is handed to it by dispatching its
# per-PR path (`pr_number`), which enqueues the head when it is green and
# holds/labels are clear, and otherwise leaves it for the green wake. Only a PR
# that now targets main is handed over.
#
# Env:
#   REPO           owner/name (default JovieInc/Jovie)
#   CHILD_PR       the stacked PR to unstack (required)
#   OLD_BASE_REF   its former base branch when GitHub already retargeted it to
#                  main after deleting the merged parent branch (optional)
#   DRY_RUN=1      plan and print only; no push, edit, comment or arming
#   ADMIT_AFTER_UNSTACK=1  dispatch green enroll for the child once it targets main (default 0)
#   GIT_REMOTE     remote name (default origin)
set -euo pipefail

# shellcheck source=./scripts/lib/gh-retry.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/gh-retry.sh"

REPO="${REPO:-JovieInc/Jovie}"
CHILD_PR="${CHILD_PR:-}"
OLD_BASE_REF="${OLD_BASE_REF:-}"
DRY_RUN="${DRY_RUN:-0}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
ADMIT_AFTER_UNSTACK="${ADMIT_AFTER_UNSTACK:-0}"
SCRIPT_DIR="$(dirname "${BASH_SOURCE[0]}")"
MARKER="unstack-merged-parent"

if [[ ! "$CHILD_PR" =~ ^[1-9][0-9]*$ ]]; then
  echo "!! CHILD_PR must be a positive integer"
  exit 2
fi

# Rebase checks out child source below. Keep the policy and its canonical API
# client from the trusted committed workflow checkout, never the child's tree.
POLICY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
POLICY_REF="$(git -C "$POLICY_ROOT" rev-parse HEAD)"
POLICY_DIR="$(mktemp -d)"
trap 'rm -rf "$POLICY_DIR"' EXIT
git -C "$POLICY_ROOT" archive "$POLICY_REF" scripts/lanes scripts/apiclient \
  packages/api-client/providers.json scripts/lib/upsert-pr-comment.sh \
  packages/api-client \
  | tar -x -C "$POLICY_DIR"

custody_read() {  # custody_read state <num> | claims <num> <expected-head>
  GITHUB_REPOSITORY="$REPO" PYTHONDONTWRITEBYTECODE=1 python3 - "$POLICY_DIR" "$@" <<'PY'
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(sys.argv[1]) / "scripts/lanes"))
import pr_events

try:
    mode, number = sys.argv[2], int(sys.argv[3])
    if mode == "claims":
        if pr_events.claim_active(number, sys.argv[4], sh=lambda args, **kw: pr_events.api_gh(args[1:] if args and args[0] == "gh" else args, **kw),
                                  kind=("fix", "gate", "adopt"), exclude_host=None):
            raise ValueError("active or unreadable claim")
    elif mode == "state":
        result = pr_events.api_gh(["pr", "view", str(number), "--repo", pr_events.REPO,
                                  "--json", "number,state,isCrossRepository,headRefName,headRefOid,baseRefName,labels"])
        if result.returncode != 0:
            raise ValueError("PR state unavailable")
        pr = json.loads(result.stdout)
        if not isinstance(pr, dict) or pr.get("number") != number \
                or pr.get("state") not in {"OPEN", "CLOSED", "MERGED"} \
                or type(pr.get("isCrossRepository")) is not bool \
                or not isinstance(pr.get("headRefOid"), str) \
                or not re.fullmatch(r"[0-9a-fA-F]{40}", pr["headRefOid"]) \
                or not all(isinstance(pr.get(key), str) and pr[key] for key in ("headRefName", "baseRefName")) \
                or not isinstance(pr.get("labels"), list) \
                or not all(isinstance(label, dict) and isinstance(label.get("name"), str) and label["name"]
                           for label in pr["labels"]):
            raise ValueError("incomplete PR state")
        print(json.dumps({"n": number, "state": pr["state"], "cross": pr["isCrossRepository"],
                          "head": pr["headRefName"], "sha": pr["headRefOid"].lower(),
                          "base": pr["baseRefName"],
                          "held": bool({name.lower() for name in pr_events.label_names(pr)} & pr_events.HOLD_LABELS)}))
    else:
        raise ValueError("unsupported custody read")
except Exception:
    print("Unstack custody is held, claimed, or unreadable; no publication authorized.", file=sys.stderr)
    sys.exit(2)
PY
}

comment() {  # comment <num> <body>
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "    [dry-run] would comment on #$1"
    return 0
  fi
  GITHUB_REPOSITORY="$REPO" bash "$POLICY_DIR/scripts/lib/upsert-pr-comment.sh" "$1" "$MARKER" "$2" \
    || echo "    !! failed to comment on #$1"
}

pr_state() {  # pr_state <num>
  custody_read state "$1"
}

merged_parent() {  # merged_parent <branch> -> "<number> <head-sha>" or empty
  local owner="${REPO%%/*}"
  gh_retry api "repos/${REPO}/pulls?state=closed&head=${owner}:${1}&per_page=20" \
    --jq '[.[] | select(.merged_at != null and .base.ref == "main")] | sort_by(.merged_at) | last
          | if . == null then empty else "\(.number) \(.head.sha | ascii_downcase)" end'
}

# rebase_branch <num> <branch> <old-upstream-sha> <onto-ref> <expected-head-sha> <expected-base>
# Prints the new head SHA. Returns 1 on conflict/empty, 2 on custody refusal.
rebase_branch() {
  local number="$1" branch="$2" upstream="$3" onto="$4" expected="$5" base="$6" new_head live
  custody_read claims "$number" "$expected" || return 2
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
  # Claims are checked for the still-published head. Read PR metadata last so a
  # hold, closure, or retarget during the rebase cannot authorize this push.
  custody_read claims "$number" "$expected" || return 2
  live="$(pr_state "$number")" || return 2
  if ! jq -e --arg branch "$branch" --arg sha "$expected" --arg base "$base" \
      '.state == "OPEN" and .cross == false and .held == false and .head == $branch and .sha == $sha and .base == $base' \
      <<<"$live" >/dev/null; then
    echo "    ~ #${number} custody changed during rebase; leaving its branch" >&2
    return 2
  fi
  if [[ "$DRY_RUN" != "1" ]]; then
    git push -q --force-with-lease="refs/heads/${branch}:${expected}" \
      "$GIT_REMOTE" "${new_head}:refs/heads/${branch}"
  fi
  echo "$new_head"
}

# admit_child <num>: once the child targets main, hand it to Merge Queue Green
# Enroll's per-PR path (workflow_dispatch pr_number). That controller owns every
# admission rule (green head, hold labels, draft, queue freeze); this script
# never writes the queue. Never fatal: the green wake is the backstop.
admit_child() {
  [[ "$ADMIT_AFTER_UNSTACK" == "1" ]] || return 0
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "    [dry-run] would dispatch green enroll for #$1"
    return 0
  fi
  node "$POLICY_DIR/packages/api-client/cli.ts" gh --priority merge -- \
    workflow run merge-queue-green-enroll.yml -R "$REPO" --ref main -f pr_number="$1" >/dev/null \
    && echo "    admit #$1: green enroll dispatched" \
    || echo "    ~ green enroll dispatch for #$1 failed; the green wake will admit it"
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
  [[ "$child_base" != "main" ]] || admit_child "$CHILD_PR"
  exit 0
fi
if new_child="$(rebase_branch "$CHILD_PR" "$child_branch" "$parent_sha" "$onto" "$child_sha" "$child_base")"; then
  :
else
  refused=$?
  [[ "$refused" != 2 ]] || exit 0
  comment "$CHILD_PR" "🤖 Unstack: parent #${parent_pr} merged, but rebasing \`${child_branch}\` onto \`main\` without the parent's commits did not apply cleanly. The branch is unchanged; the conflict lane owns it next. _(at $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
  exit 0
fi
echo "  ✓ rebased #$CHILD_PR: ${child_sha:0:12} -> ${new_child:0:12}"
if [[ "$child_base" != "main" && "$DRY_RUN" != "1" ]]; then
  gh_retry pr edit "$CHILD_PR" -R "$REPO" --base main >/dev/null
fi
echo "  ✓ #$CHILD_PR targets main"
admit_child "$CHILD_PR"
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
    if gc_new="$(rebase_branch "$grandchild" "$gc_branch" "$old_tip" "$new_tip" "$gc_sha" "$branch")"; then
      echo "  ✓ restacked #$grandchild on ${branch}: ${gc_sha:0:12} -> ${gc_new:0:12}"
      comment "$grandchild" "🤖 Unstack: its parent \`${branch}\` was rebased onto \`main\` after #${parent_pr} merged, so this PR was restacked on the new parent tip with only its own commits (\`${gc_sha:0:12}\` → \`${gc_new:0:12}\`). _(at $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
      queue+=("${gc_branch} ${gc_sha} ${gc_new}")
    else
      refused=$?
      [[ "$refused" != 2 ]] || continue
      comment "$grandchild" "🤖 Unstack: its parent \`${branch}\` was rebased onto \`main\` after #${parent_pr} merged, but restacking this PR on the new parent tip conflicted. The branch is unchanged. _(at $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
    fi
  done < <(gh_retry pr list -R "$REPO" --state open --base "$branch" --limit 50 --json number --jq '.[].number')
done

echo "=== done (DRY_RUN=$DRY_RUN) ==="
