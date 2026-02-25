---
description: Fix systemic CI blockers on main, rebase all PRs, then orchestrate to zero
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

### Run the full CI suite locally:
```bash
pnpm --filter web exec tsc --noEmit          # typecheck
pnpm biome check apps/web                     # lint
pnpm vitest --run --changed                   # tests
pnpm --filter web lint:server-boundaries       # boundaries
```

### Fix failures:
- TypeScript errors: fix the types
- Lint errors: `pnpm biome check apps/web --write` then fix remaining
- Test failures: fix the code (not the test, unless the test is wrong)
- A11y regressions: add aria labels, fix contrast, add roles as needed

### Validate the fix:
```bash
pnpm --filter web exec tsc --noEmit && pnpm biome check apps/web && pnpm vitest --run
```

### Commit and push to main:
```bash
git add -A
git commit -m "fix: resolve systemic CI blockers

Fixes: <list the check names that were failing>

Co-authored-by: Claude <claude@anthropic.com>"
git push origin main
```

### Wait for CI on main:
```bash
# Watch the latest CI run
gh run list --branch main --limit 1 --json databaseId,status,conclusion
# If still running, wait:
gh run watch <RUN_ID>
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

## Phase 3: Run /orchestrate

Now that main is fixed and all PRs are rebased, use the existing orchestrate workflow to process remaining failures:

Execute the full `/orchestrate` command. It will:
- Enable auto-merge on everything passing
- Deduplicate overlapping PRs
- Fix remaining CI failures (branch-specific, not systemic)
- Address review comments
- Resolve merge conflicts
- Close stale/stuck PRs
- Label truly stuck PRs as `needs-human`

## Phase 4: Report

After orchestrate completes, produce a final summary:

```bash
# Final state
MERGED=$(gh pr list --state merged --json number --jq 'length' --search "merged:>=$(date -v-1H +%Y-%m-%dT%H:%M:%S)" 2>/dev/null || echo "check manually")
CLOSED=$(gh pr list --state closed --json number --jq 'length' --search "closed:>=$(date -v-1H +%Y-%m-%dT%H:%M:%S)" 2>/dev/null || echo "check manually")
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

## Key Difference from /orchestrate

`/drain` adds Phase 0 and Phase 1 — diagnosing and fixing **systemic** issues on main before touching individual PRs. This prevents the pattern where you fix 17 PRs individually for the same root cause.

**Use `/orchestrate`** when main is healthy and you just need to process the queue.
**Use `/drain`** when PRs are piling up and the same checks keep failing everywhere.

## Constraints

- **NEVER force-push to main** — only clean commits
- **NEVER skip CI** on main — wait for green before proceeding
- **NEVER merge PRs with failing checks** — fix first
- **Systemic fixes go on main** — don't fix the same thing on 17 branches
- **Individual fixes go on branches** — branch-specific issues stay on branches
- Always run `/verify` before pushing fixes
