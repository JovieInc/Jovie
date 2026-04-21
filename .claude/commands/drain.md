---
description: Fix systemic CI blockers on main, rebase all PRs, then process the queue to zero
allowed-tools: Bash(gh:*), Bash(git:*), Bash(pnpm:*), Bash(jq:*), Bash(node:*), Bash(bash:*)
---

# Drain — PRs to Zero

One command to clear the entire PR queue. Fixes root causes first, then processes individual PRs.

## Current State

Branch: !`git branch --show-current`
Open PRs: !`gh pr list --state open --json number,title --jq 'length'`

## Phase 0: Diagnose Systemic Blockers

Before touching any individual PR, identify failures that repeat across multiple PRs. Fixing these on main eliminates cascading failures.

```bash
# Get all open PRs with their check status
gh pr list --state open --json number,title,headRefName,statusCheckRollup,labels --limit 100
```

For each open PR, collect failing checks:

```bash
gh pr checks <NUMBER> --json name,state,conclusion 2>/dev/null || echo "[]"
```

**Build a failure matrix:**
| Check Name | Failing PRs | Count | Systemic? |

A check is **systemic** if it fails on 3+ PRs. Common systemics:
- A11y (axe) regressions introduced on main
- Build failures from broken shared components
- Flaky test suites
- Lint rules that changed on main but branches are stale

**Output:** List of systemic blockers (if any) and the check names that are failing everywhere.

If no systemic blockers found, skip to Phase 2.

## Phase 1: Fix Systemic Issues on Main

For each systemic blocker identified in Phase 0:

```bash
git checkout main
git pull origin main
```

### Run the full CI suite locally

```bash
pnpm --filter web exec tsc --noEmit          # typecheck
pnpm biome check apps/web                     # lint
pnpm vitest --run --changed                   # tests
pnpm --filter web lint:server-boundaries       # boundaries
```

### Fix failures

- TypeScript errors: fix the types
- Lint errors: `pnpm biome check apps/web --write` then fix remaining
- Test failures: fix the code (not the test, unless the test is wrong)
- A11y regressions: add aria labels, fix contrast, add roles as needed

### Validate the fix

```bash
pnpm --filter web exec tsc --noEmit && pnpm biome check apps/web && pnpm vitest --run
```

### Create a fix branch and open a PR

```bash
git checkout -b fix/systemic-ci-blockers main
git add -A
git commit -m "fix: resolve systemic CI blockers

Fixes: <list the check names that were failing>

Co-authored-by: Claude <claude@anthropic.com>"
git push origin fix/systemic-ci-blockers
gh pr create --base main --head fix/systemic-ci-blockers --title "fix: resolve systemic CI blockers"
```

### Wait for CI on the fix PR

```bash
# Watch the latest CI run
gh run list --branch fix/systemic-ci-blockers --limit 1 --json databaseId,status,conclusion
# If still running, wait:
gh run watch <RUN_ID>
# Once green, merge the PR:
gh pr merge --auto --squash
```

**Do NOT proceed to Phase 2 until main CI is green.**

## Phase 2: Bulk Rebase All Open PRs

Now that main is healthy, update every open PR branch:

```bash
# Get all open PR numbers
OPEN_PRS=$(gh pr list --state open --json number --jq '.[].number')

for PR in $OPEN_PRS; do
  echo "Updating PR #$PR branch..."
  gh api repos/{owner}/{repo}/pulls/$PR/update-branch --method PUT 2>/dev/null || echo "PR #$PR: update-branch failed (may have conflicts)"
done
```

Wait for CI to re-run on all PRs (give it a few minutes for checks to start):

```bash
sleep 120  # Let GitHub trigger CI runs

# Check status of all PRs
for PR in $OPEN_PRS; do
  echo "PR #$PR checks:"
  gh pr checks $PR --json name,state,conclusion 2>/dev/null | jq -r '.[] | "\(.name): \(.conclusion // .state)"'
  echo "---"
done
```

## Phase 2.5: Promote Drafts + Close Duplicates

After rebasing, audit drafts and duplicates before orchestrating:

### Promote passing drafts to ready-for-review

```bash
DRAFT_PRS=$(gh pr list --state open --draft --json number --limit 100 --jq '.[].number')

for PR in $DRAFT_PRS; do
  FAILING=$(gh pr checks $PR 2>/dev/null | grep -v skipping | grep "fail" | grep -v "Preview Deploy")
  if [ -z "$FAILING" ]; then
    echo "PR #$PR passed CI — promoting to ready-for-review"
    gh pr ready $PR
    gh pr merge $PR --auto
  else
    echo "PR #$PR still has failures — skipping"
  fi
done
```

### Close duplicate PRs

Duplicates appear when agents open two PRs for the same Linear issue. Identify by matching titles:

```bash
gh pr list --state open --json number,title --limit 100 | python3 -c "
import sys, json, collections
prs = json.load(sys.stdin)
by_title = collections.defaultdict(list)
for p in prs:
    by_title[p['title']].append(p['number'])
for title, nums in by_title.items():
    if len(nums) > 1:
        print(f'DUPLICATE: {title} -> PRs {sorted(nums)}')
"
```

For each duplicate group, keep the **lowest-numbered PR** and close the rest:

```bash
gh pr close <DUPLICATE_NUMBER> --comment "Closing duplicate — #<CANONICAL> is the canonical PR."
```

## Phase 3: Process Remaining PRs

Now that main is fixed and all PRs are rebased, process the remaining queue:

### Enable auto-merge on passing PRs

```bash
OPEN_PRS=$(gh pr list --state open --json number --jq '.[].number')

for PR in $OPEN_PRS; do
  FAILING=$(gh pr checks $PR 2>/dev/null | grep -v skipping | grep "fail" | grep -v "Preview Deploy")
  if [ -z "$FAILING" ]; then
    echo "PR #$PR passed CI — enabling auto-merge"
    gh pr merge $PR --auto --squash
  else
    echo "PR #$PR still has failures"
  fi
done
```

### Phase 3b: Parallel per-PR agents (MANDATORY for remaining failures)

For every still-failing PR after Phase 3, spawn ONE Agent per PR IN PARALLEL using `isolation: "worktree"` and `mode: "bypassPermissions"`. Send all spawn calls in a single message (multiple Agent tool calls in one turn) so they run concurrently.

Each agent's prompt must include:
1. The PR number, title, head branch
2. Current failing checks (name + log URL from `gh pr checks $PR`)
3. Any unresolved bot/human review comments (fetch via `gh api repos/{owner}/{repo}/pulls/$PR/comments --paginate`)
4. Instructions:
   - Check out the PR's head branch in the worktree
   - Rebase onto latest `main`; resolve conflicts preserving PR intent
   - Run `pnpm --filter=@jovie/web exec tsc --noEmit`, `pnpm biome check apps/web`, and the failing test files locally
   - Fix root causes (not symptoms); update tests only if they're wrong
   - Address each unaddressed CodeRabbit / Greptile comment (fix or reply explaining why declined)
   - Commit with conventional messages, push to the PR head branch
   - Enable auto-merge via `gh pr merge $PR --auto`
   - Report DONE / DONE_WITH_CONCERNS / BLOCKED with the specific reason

Sample Agent tool call (repeat per PR, all in one message):

```
Agent({
  subagent_type: "general-purpose",
  isolation: "worktree",
  mode: "bypassPermissions",
  description: "Fix PR #<NUMBER>",
  prompt: "<self-contained prompt with failures + comments + instructions>"
})
```

Do NOT wait for one agent before spawning the next. Do NOT run them sequentially. The point of this phase is fan-out.

After all agents return, re-run Phase 3 auto-merge enablement and report.

### Close stale or stuck PRs

PRs that can't be fixed automatically (agent returns BLOCKED):
- Close with a comment explaining why
- Label as `needs-human` if human intervention is required

## Phase 4: Report

Produce a final summary:

```bash
# Final state
ONE_HOUR_AGO=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)
MERGED=$(gh pr list --state merged --json number --jq 'length' --search "merged:>=$ONE_HOUR_AGO" 2>/dev/null || echo "check manually")
CLOSED=$(gh pr list --state closed --json number --jq 'length' --search "closed:>=$ONE_HOUR_AGO" 2>/dev/null || echo "check manually")
OPEN=$(gh pr list --state open --json number,title,labels --limit 100)
```

```markdown
## Drain Results

### Systemic Issues Found & Fixed
- <list issues fixed on main, or "None">

### PR Queue Status
- Merged: X PRs
- Closed (duplicates/stale): X PRs
- Still open: X PRs

### Still Open (if any)
| # | Title | Blocking Reason | Label |
|---|-------|-----------------|-------|

### Recommendations
- <any patterns observed, e.g. "agents keep creating a11y issues — add pre-push axe check">
- <any recurring failure patterns to address in AGENTS.md or CI>
```

## Constraints

- **NEVER force-push to main** — only clean commits
- **NEVER skip CI** on main — wait for green before proceeding
- **NEVER merge PRs with failing checks** — fix first
- **Systemic fixes go on main** — don't fix the same thing on 17 branches
- **Individual fixes go on branches** — branch-specific issues stay on branches
- Always run `/verify` before pushing fixes
