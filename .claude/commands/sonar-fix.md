# SonarCloud Fix Command

Automatically fetch, prioritize, and fix SonarCloud issues — shipping incremental PRs as fast as possible so CI runs in parallel.

## Instructions

You are tasked with fixing SonarCloud issues. **Before creating any new PRs, check for and address existing sonar-fix PRs that have unmerged review comments.** Then ship each new batch as its own PR immediately. Don't wait for CI.

### 0. Address Existing Sonar-Fix PRs

Before creating any new fix PRs, check if there are open sonar-fix PRs with unaddressed review comments. This prevents PR sprawl — many open PRs that never merge because feedback goes unanswered.

#### 0a. Discover Open Sonar-Fix PRs

Search for open PRs with sonarcloud-related branch names:

```bash
gh pr list --state open --json number,title,headRefName,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,updatedAt \
  --jq '[.[] | select(.headRefName | startswith("fix/sonarcloud"))]'
```

If zero results: print "No existing sonar-fix PRs found. Proceeding to create new fixes." and skip to Step 1.

#### 0b. Collect Review State for Each PR

For each open sonar-fix PR, fetch its review comments and status:

```bash
# Get all review comments (line-level)
gh api repos/{owner}/{repo}/pulls/<NUMBER>/comments --paginate

# Get reviews (approve/request-changes)
gh api repos/{owner}/{repo}/pulls/<NUMBER>/reviews --paginate

# Get general PR discussion comments
gh pr view <NUMBER> --json comments

# Check CI status
gh pr checks <NUMBER>
```

Classify each PR:
- **NO_ACTION_NEEDED** — No unaddressed comments, auto-merge enabled, no conflicts. Skip.
- **COMMENTS_TO_ADDRESS** — Has unaddressed review comments (human or bot). Process in Step 0c.
- **CONFLICT** — Has merge conflicts. Attempt branch update first:
  ```bash
  gh api repos/{owner}/{repo}/pulls/<NUMBER>/update-branch --method PUT
  ```
  If update fails, mark as **NEEDS_HUMAN** and skip.
- **NEEDS_HUMAN** — Requires architectural changes beyond sonar scope (e.g., human reviewer requested a design change). Skip with a note.

Process COMMENTS_TO_ADDRESS PRs first, then CONFLICT PRs.

#### 0c. Address Comments on Each PR

For each COMMENTS_TO_ADDRESS PR, follow this cycle:

1. **Check out the PR branch:**
   ```bash
   git checkout <branch-name> && git pull origin <branch-name>
   ```

2. **For each unaddressed comment, classify it:**
   - **ACTIONABLE** — A valid code concern (from a human reviewer or bot like CodeRabbit). Fix the code.
   - **ALREADY ADDRESSED** — The issue was fixed in a subsequent commit on the branch. Reply with evidence.
   - **NOT APPLICABLE** — False positive, stylistic disagreement on a sonar fix, or a question. Reply explaining why.

3. **Make the fixes** to the affected files.

4. **Run /verify** to ensure fixes don't break anything:
   - TypeScript compiles
   - Biome lint passes
   - Affected tests pass

5. **Commit and push:**
   ```bash
   git add <specific-files>
   git commit -m "fix: address review comments on sonar-fix PR #<NUMBER>

   - {Brief description of fix 1}
   - {Brief description of fix 2}

   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
   git push
   ```

6. **Reply to each comment** with evidence of the fix:
   ```bash
   # For line-level review comments
   gh api repos/{owner}/{repo}/pulls/<NUMBER>/comments/<COMMENT_ID>/replies \
     --method POST -f body="**Fixed** in \`<SHA>\`.

   \`\`\`diff
   - <old line>
   + <new line>
   \`\`\`

   **Why:** <1-sentence explanation>"

   # For top-level PR comments
   gh api repos/{owner}/{repo}/issues/<NUMBER>/comments \
     --method POST -f body="**Addressed** in \`<SHA>\`. <explanation>"
   ```

7. **Return to develop:**
   ```bash
   git checkout develop && git pull origin develop
   ```

#### 0d. Ensure Auto-Merge on All Processed PRs

For every open sonar-fix PR (including ones just fixed):

```bash
# Enable auto-merge if not already
gh pr merge <NUMBER> --auto --squash

# Update branch with latest base
gh api repos/{owner}/{repo}/pulls/<NUMBER>/update-branch --method PUT
```

#### 0e. Existing PR Summary

Output a summary before proceeding to new fixes:

```text
Existing Sonar-Fix PR Status:
  Addressed comments: {N} PRs (#{X}, #{Y}, #{Z})
  Already clean: {N} PRs (#{A}, #{B})
  Conflicts (needs human): {N} PRs (#{C})
  Needs human review: {N} PRs (#{D})

Proceeding to create new fix PRs...
```

### 1. Fetch Current SonarCloud Issues

Fetch issues from SonarCloud API:

```bash
# Get issues sorted by severity (BLOCKER > CRITICAL > MAJOR > MINOR > INFO)
curl -s "https://sonarcloud.io/api/issues/search?componentKeys=JovieInc_Jovie&resolved=false&ps=50&s=SEVERITY&asc=false" \
  -H "Authorization: Bearer $SONAR_TOKEN" 2>/dev/null || echo "SONAR_TOKEN not set - use web UI"
```

If API unavailable, ask user to paste issues from: https://sonarcloud.io/project/issues?id=JovieInc_Jovie

### 2. Prioritize and Group Issues

Group issues into small, shippable batches:

**Priority Order (fix highest first):**
1. BLOCKER - Must fix immediately
2. CRITICAL - Security/reliability issues
3. MAJOR - Significant code quality issues
4. MINOR - Minor improvements
5. INFO - Suggestions

**Batching Rules (Ship Fast, Fail Fast):**
- Group by rule type (e.g., all cognitive complexity, all a11y issues)
- Maximum 5-7 issues per batch (smaller = faster CI feedback)
- Never mix security fixes with style fixes
- Each batch must stay within PR Discipline limits: **max 10 files, max 400 lines diff**
- If a single rule type would exceed limits, split into sub-batches
- **PR sprawl cap:** If there are already 3+ open sonar-fix PRs after Step 0, do NOT create new ones. Address existing PRs and wait for them to merge first.

**Stop Conditions:**
- If no issues remain, report "All SonarCloud issues resolved!"
- If only INFO-level issues remain, ask user if they want to proceed
- If 3+ sonar-fix PRs are already open, report the count and stop — do not create new PRs until existing ones merge

### 3. Fix-Ship Loop

For each batch, repeat this cycle:

#### 3a. Plan and Fix

1. Read the affected files
2. Understand the SonarCloud rule being violated
3. Make the minimal fix that resolves each issue — no behavior changes

**Common SonarCloud Rules:**
| Rule | Fix |
|------|-----|
| S3776 (Cognitive Complexity) | Extract helper functions, use early returns |
| S1128 (Unused imports) | Remove the import |
| S1854 (Dead stores) | Remove unused variable assignment |
| S4144 (Duplicate functions) | Extract shared logic |
| S1066 (Collapsible if) | Merge conditions with && |
| S125 (Commented code) | Remove or restore the code |
| S6544 (Promise void) | Wrap async handlers with `void` |
| S6859 (Regex precedence) | Add non-capturing groups |
| S2201 (Unused return) | Use or remove the return value |

#### 3b. Size Gate

Before committing, check the batch fits PR Discipline limits:

```bash
git diff --stat | tail -1   # check file count and line count
```

If >10 files or >400 lines changed, split this batch — commit only what fits, leave the rest for the next iteration.

#### 3c. Verify

Run /verify on the batch:
- TypeScript compiles
- Biome lint passes
- Affected tests pass

If verification fails, fix before proceeding.

#### 3d. Ship Immediately

```bash
# Ensure on latest develop
git checkout develop && git pull origin develop

# Create feature branch
git checkout -b fix/sonarcloud-{rule-or-category}-{batch-number}

# Stage and commit
git add <specific-files>
git commit -m "fix: resolve SonarCloud {category} issues (batch {N})

- {Brief description of fix 1}
- {Brief description of fix 2}

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"

# Push, create PR, enable auto-merge — then move on
git push -u origin fix/sonarcloud-{rule-or-category}-{batch-number}

gh pr create \
  --title "fix: resolve SonarCloud {category} issues" \
  --body "$(cat <<'EOF'
## Summary
Fixes {N} SonarCloud issues ({severity} priority):
- {Issue 1 description}
- {Issue 2 description}

## SonarCloud Rules Addressed
- {Rule ID}: {Rule description}

## Test plan
- [x] TypeScript compiles
- [x] Biome lint passes
- [x] No behavior changes (code quality fixes only)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

gh pr merge --auto --squash
```

**Do NOT wait for CI.** Immediately return to develop and start the next batch.

```bash
git checkout develop
```

#### 3e. Next Batch

Repeat from step 3a with the next group of issues. Each PR ships independently — CI runs in parallel on all of them.

### 4. Summary Output

After all batches are shipped:

```text
SonarCloud Fix Run Complete

Existing PRs Addressed:
  1. {PR URL} - addressed {N} review comments
  2. {PR URL} - no action needed (auto-merge enabled)
  ...

New PRs Created:
  1. {PR URL} - {category} ({N} issues) - CI: pending
  2. {PR URL} - {category} ({N} issues) - CI: pending
  ...

Total Issues Fixed: {N}
Total PRs Created: {N}
Remaining Issues: {count}
  Next priority: {description of remaining issues}
```

## Important Notes

- **Never change behavior** - Only fix code quality, not functionality
- **One category per PR** - Keep PRs focused and reviewable
- **Ship fast, fail fast** - Push each batch immediately, don't wait for CI
- **Size gates are hard limits** - Split if >10 files or >400 lines
- **Verify before commit** - All local checks must pass per batch
- **Auto-merge requires CI** - Each PR will merge independently when checks pass
- **Skip flaky tests** - If CI fails on unrelated tests, document and proceed
- **Ask when uncertain** - If a fix might change behavior, ask the user first
- **Address existing PRs first** - Never create new sonar-fix PRs while older ones have unaddressed review comments

## Fallback: Manual Issue Input

If SonarCloud API is unavailable, ask user to provide issues in this format:

```
File: path/to/file.tsx
Line: 42
Rule: S3776
Message: Refactor this function to reduce cognitive complexity
Severity: CRITICAL
```
