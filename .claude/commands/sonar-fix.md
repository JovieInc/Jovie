# SonarCloud Fix Command

Automatically fetch, prioritize, and fix SonarCloud issues — shipping incremental PRs as fast as possible so CI runs in parallel.

## Instructions

You are tasked with fixing SonarCloud issues. Ship each batch as its own PR immediately, then move to the next. Don't wait for CI.

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

**Stop Conditions:**
- If no issues remain, report "All SonarCloud issues resolved!"
- If only INFO-level issues remain, ask user if they want to proceed

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
# Ensure on latest main
git checkout main && git pull origin main

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

**Do NOT wait for CI.** Immediately return to main and start the next batch.

```bash
git checkout main
```

#### 3e. Next Batch

Repeat from step 3a with the next group of issues. Each PR ships independently — CI runs in parallel on all of them.

### 4. Summary Output

After all batches are shipped:

```
SonarCloud Fix Run Complete

PRs Created:
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

## Fallback: Manual Issue Input

If SonarCloud API is unavailable, ask user to provide issues in this format:

```
File: path/to/file.tsx
Line: 42
Rule: S3776
Message: Refactor this function to reduce cognitive complexity
Severity: CRITICAL
```
