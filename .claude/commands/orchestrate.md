---
description: Review and process all open PRs (including drafts) to completion with AI agent assignment and validation
allowed-tools: Bash(gh:*), Bash(git:*), Bash(pnpm:*), Bash(jq:*)
---

# Orchestrate PR Workflow

Process ALL open pull requests to zero. Run once, walk away, come back to an empty queue.

## Current Repository Status

Branch: !`git branch --show-current`
Status: !`git status --short`
Recent main: !`git log main --oneline -3`

## Phase 0: Full Inventory

Collect the complete state of every open PR. This is the single source of truth for the entire run.

```bash
gh pr list --state open --json number,title,isDraft,author,headRefName,baseRefName,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,labels,updatedAt,createdAt --limit 100
```

For each PR, also collect:
```bash
# Reviews and their state
gh pr view <NUMBER> --json reviews,reviewRequests,comments

# Check suite status
gh pr checks <NUMBER>

# Diff stats (to gauge complexity)
gh pr diff <NUMBER> --stat
```

Build a **PR ledger** — a mental table with columns:
| # | Title | Branch | Mergeable | Checks | Review | Blocking Reason | Complexity | Action |

Classify each PR into one of these states:
- **READY**: All checks green, approved or no review required, no conflicts — just needs merge
- **NEEDS_AUTO_MERGE**: Checks pending but likely to pass — enable auto-merge and move on
- **CONFLICT**: Has merge conflicts that need resolution
- **FAILING_CHECKS**: CI failures (lint, typecheck, tests)
- **REVIEW_BLOCKED**: Has requested changes or blocking reviews
- **COMMENT_PENDING**: Has unaddressed review comments (AI or human)
- **DUPLICATE**: Overlaps with another PR addressing the same concern
- **STUCK**: No progress possible without human intervention

## Phase 1: Quick Wins — Auto-Merge & Update Branch (All PRs)

This phase runs FIRST because it resolves the most PRs with the least effort.

For EVERY open PR (unless it has conflicts or is a duplicate):

### 1a. Convert drafts that are ready
If a draft PR has all checks passing and no unresolved comments:
```bash
gh pr ready <NUMBER>
```

### 1b. Enable auto-merge
```bash
gh pr merge <NUMBER> --auto --squash
```

### 1c. Enable update branch
Ensure the branch is up to date with the base branch. If GitHub's "Update branch" is available:
```bash
gh api repos/{owner}/{repo}/pulls/<NUMBER>/update-branch --method PUT
```

### 1d. Record which PRs now have auto-merge enabled
Track these — you'll check back on them in Phase 5.

## Phase 2: Deduplicate — Resolve Overlapping PRs

Before doing any fix-up work, identify PRs that address the same concern:

### Detection
- Compare PR titles, branch names, and changed files
- Two PRs modifying the same files or with similar titles = potential duplicates
- Check if one PR is a superset of another

### Resolution
For each duplicate set:
1. **Compare quality**: Which PR has better code, more complete implementation, passing checks?
2. **Pick the winner**: Choose the PR with the most progress / best implementation
3. **Close the loser**: Close the redundant PR with a comment explaining why:
```bash
gh pr close <LOSER_NUMBER> --comment "Closing in favor of #<WINNER_NUMBER> which provides a more complete implementation of the same change."
```
4. If the losing PR has useful commits not in the winner, cherry-pick them:
```bash
git checkout <winner-branch>
git cherry-pick <useful-commit-sha>
git push
```

## Phase 3: Fix Blocking Issues (Sorted by Easiest First)

Process remaining PRs in this order:
1. **COMMENT_PENDING** — just needs replies/fixes to review comments
2. **FAILING_CHECKS** — lint/type/test failures
3. **REVIEW_BLOCKED** — needs review dismissal or re-review
4. **CONFLICT** — needs merge conflict resolution

### 3a. Address Review Comments

For each PR with unaddressed comments from CodeRabbit, Codex, Sentry, Claude, or humans:

```bash
# Get all review comments
gh api repos/{owner}/{repo}/pulls/<NUMBER>/comments --paginate
gh api repos/{owner}/{repo}/pulls/<NUMBER>/reviews --paginate
gh pr view <NUMBER> --json comments
```

**Process each comment:**
1. **Read the comment** — understand what's being asked
2. **Check out the branch**: `git checkout <branch-name> && git pull`
3. **Assess the comment:**
   - If it's a valid code concern: fix the code
   - If it's a style/nit suggestion: apply it if it improves the code, otherwise reply explaining why not
   - If it's an AI-generated false positive: reply explaining why the current code is correct
   - If it's a question: answer it
4. **Make the fix** — edit the files, commit, push
5. **Reply to the comment** confirming the fix:
```bash
gh api repos/{owner}/{repo}/pulls/<NUMBER>/comments/<COMMENT_ID>/replies --method POST -f body="Fixed in <SHA>."
```
6. **Resolve the conversation** if GitHub supports it via API

**IMPORTANT**: After addressing all comments on a PR, run `/verify` to catch issues before pushing. This prevents review ping-pong.

### 3b. Fix CI Failures

For each PR with failing checks:

```bash
gh pr checks <NUMBER>
```

1. **Identify failures**: lint, typecheck, tests, build, security
2. **Check out the branch**: `git checkout <branch-name> && git pull`
3. **Fix each failure type:**

   **Lint failures:**
   ```bash
   pnpm biome check . --write
   ```
   If biome can't auto-fix, manually fix the reported issues.

   **TypeScript failures:**
   ```bash
   pnpm turbo typecheck --filter=@jovie/web 2>&1
   ```
   Fix type errors. Common patterns: missing imports, wrong types, null checks.

   **Test failures:**
   ```bash
   pnpm vitest --run 2>&1
   ```
   Fix failing tests. Fix the code, not the test (unless the test is wrong).

   **Server boundary violations:**
   ```bash
   pnpm --filter web lint:server-boundaries
   ```

4. **Commit and push** all fixes
5. **Run `/verify`** before pushing to ensure no regressions

### 3c. Dismiss Blocking Reviews (Only When Comments Are Addressed)

**CRITICAL: Only dismiss reviews when ALL of the reviewer's comments have been addressed.**

1. **Verify all comments are addressed**: Check every comment from the blocking reviewer
2. **If all addressed**, dismiss the review:
```bash
# Get the review ID
gh api repos/{owner}/{repo}/pulls/<NUMBER>/reviews --jq '.[] | select(.state == "CHANGES_REQUESTED") | .id'

# Dismiss the review
gh api repos/{owner}/{repo}/pulls/<NUMBER>/reviews/<REVIEW_ID>/dismissals --method PUT -f message="All review comments have been addressed."
```
3. **If NOT all addressed**, go back to 3a and address the remaining comments first

### 3d. Resolve Merge Conflicts

For each PR with conflicts:

1. **Check out the branch** and update from main:
```bash
git checkout <branch-name>
git pull
git fetch origin main
git merge origin/main
```

2. **Resolve conflicts intelligently:**
   - Read both sides of each conflict
   - Understand the intent of both changes
   - Keep the PR's changes where they don't contradict main
   - Incorporate main's changes where the PR's changes are stale
   - For `package.json` / `pnpm-lock.yaml` conflicts: prefer main's dependency versions, keep the PR's new dependencies
   - For migration files: NEVER merge migration conflicts — if both sides add migrations, keep both files with correct ordering

3. **After resolving**, run full validation:
```bash
pnpm install
pnpm turbo typecheck --filter=@jovie/web
pnpm biome check .
pnpm vitest --run --changed
```

4. **Commit and push** the merge resolution

5. **After conflict resolution, run `/verify`** to prevent regressions

## Phase 4: Enable Auto-Merge on Fixed PRs

After fixing each PR in Phase 3:
```bash
gh pr merge <NUMBER> --auto --squash
```

Also re-enable update branch:
```bash
gh api repos/{owner}/{repo}/pulls/<NUMBER>/update-branch --method PUT
```

## Phase 5: Monitor & Loop

This is where determinism comes from. Do NOT assume PRs will merge.

### Loop until queue is empty:

```bash
# Refresh the full PR list
gh pr list --state open --json number,title,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup --limit 100
```

For each still-open PR:

1. **Check if auto-merge succeeded** — if merged, remove from ledger
2. **Check if new comments appeared** — if so, go back to Phase 3a
3. **Check if checks regressed** — if so, go back to Phase 3b
4. **Check if new conflicts appeared** (from other PRs merging) — if so, go back to Phase 3d
5. **Check if the PR is stuck:**
   - Same state for 2+ loop iterations = STUCK
   - Auto-merge enabled but not merging after checks pass = investigate
   - Checks perpetually pending = investigate CI

### Stuck PR handling:
- If checks are timing out: re-trigger them via `gh run rerun`
- If auto-merge won't engage: check branch protection rules, try manual merge if all criteria met
- If a PR keeps failing the same check: read the error carefully, it may need a different approach
- If truly stuck (external dependency, unclear requirement): mark as NEEDS_HUMAN and move on

### Loop termination:
- **Success**: All PRs merged or closed
- **Partial**: Some PRs merged, remaining are marked NEEDS_HUMAN with clear explanations
- **Max iterations**: After 5 full loops with no progress on any PR, stop and report

## Phase 6: Final Report

Produce a summary table:

```markdown
## Orchestrate Results

### Merged (X PRs)
| # | Title | Method |
|---|-------|--------|
| 123 | feat: add analytics | auto-merge |
| 124 | fix: auth redirect | manual after conflict resolution |

### Closed (X PRs)
| # | Title | Reason |
|---|-------|--------|
| 125 | fix: auth redirect v2 | Duplicate of #124 |

### Needs Human Review (X PRs)
| # | Title | Blocking Reason | What Was Tried |
|---|-------|-----------------|----------------|
| 126 | feat: payment flow | Unclear requirement in comment from @user | Addressed 3/4 comments, #4 needs product decision |

### Statistics
- Total PRs processed: X
- Merged: X
- Closed (duplicates): X
- Remaining: X
- Loops completed: X
```

## Critical Constraints

**NEVER:**
- Use `--force`, `--no-verify`, or override any checks
- Skip git hooks or CI/CD guardrails
- Merge PRs with failing checks
- Dismiss reviews without verifying ALL comments are addressed
- Force-push to any branch
- Delete branches that have open PRs
- Introduce regressions — always run `/verify` after significant changes
- Assume a PR will merge — always verify

**ALWAYS:**
- Work from easiest to hardest (maximize throughput)
- Run `/verify` after addressing review comments or fixing failures
- Check for new comments/failures after each fix (state changes as PRs merge)
- Resolve conflicts by understanding both sides, not blindly picking one
- Close duplicate PRs with an explanation
- Keep the PR ledger updated as state changes
- Process PRs deterministically — same input state = same actions
- Leave clear comments on every PR you touch explaining what was done
- Return to main branch when switching between PRs: `git checkout main && git pull`

**ORDERING PRINCIPLE:**
The fastest path to zero PRs is:
1. Enable auto-merge on everything first (many PRs will merge themselves)
2. Deduplicate (reduces total work)
3. Fix easiest PRs first (more merges = fewer conflicts on remaining PRs)
4. Loop back — each merge may unblock or create new conflicts on remaining PRs
