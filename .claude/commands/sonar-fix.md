# SonarCloud Fix Command

Automatically fetch, prioritize, and fix SonarCloud issues in a single PR with auto-merge.

## Instructions

You are tasked with fixing the next logical batch of SonarCloud issues. Follow these steps:

### 1. Fetch Current SonarCloud Issues

Fetch issues from SonarCloud API:

```bash
# Get issues sorted by severity (BLOCKER > CRITICAL > MAJOR > MINOR > INFO)
curl -s "https://sonarcloud.io/api/issues/search?componentKeys=JovieInc_Jovie&resolved=false&ps=50&s=SEVERITY&asc=false" \
  -H "Authorization: Bearer $SONAR_TOKEN" 2>/dev/null || echo "SONAR_TOKEN not set - use web UI"
```

If API unavailable, ask user to paste issues from: https://sonarcloud.io/project/issues?id=JovieInc_Jovie

### 2. Prioritize and Group Issues

Group issues into a single PR batch using these criteria:

**Priority Order (fix highest first):**
1. BLOCKER - Must fix immediately
2. CRITICAL - Security/reliability issues
3. MAJOR - Significant code quality issues
4. MINOR - Minor improvements
5. INFO - Suggestions

**Grouping Rules for Single PR:**
- Same rule type (e.g., all cognitive complexity, all a11y issues)
- Same component/directory when possible
- Maximum 10-15 issues per PR to keep reviews manageable
- Never mix security fixes with style fixes

**Stop Conditions:**
- If no issues remain, report "All SonarCloud issues resolved!"
- If only INFO-level issues remain, ask user if they want to proceed

### 3. Plan the Fixes

For each issue in the batch:
1. Read the affected file
2. Understand the SonarCloud rule being violated
3. Plan the minimal fix that resolves the issue

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

### 4. Apply Fixes

For each issue:
1. Make the minimal change to fix the issue
2. Ensure no behavior changes
3. Preserve existing formatting style

### 5. Run Verification

Execute the /verify command:
- TypeScript compiles
- Biome lint passes
- Affected tests pass

If verification fails, fix the issues before proceeding.

### 6. Run Simplification

Execute the /simplify command:
- Review changed files for additional cleanup opportunities
- Apply only non-breaking simplifications

### 7. Create PR with Auto-Merge

1. **Ensure on main branch:**
   ```bash
   git checkout main && git pull origin main
   ```

2. **Create feature branch:**
   ```bash
   git checkout -b fix/sonarcloud-{rule-or-category}
   ```
   Examples: `fix/sonarcloud-cognitive-complexity`, `fix/sonarcloud-unused-code`

3. **Commit changes:**
   ```bash
   git add -A
   git commit -m "fix: resolve SonarCloud {category} issues

   - {Brief description of fix 1}
   - {Brief description of fix 2}
   ...

   Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
   ```

4. **Push and create PR with auto-merge:**
   ```bash
   git push -u origin fix/sonarcloud-{rule-or-category}

   gh pr create \
     --title "fix: resolve SonarCloud {category} issues" \
     --body "$(cat <<'EOF'
   ## Summary
   Fixes {N} SonarCloud issues ({severity} priority):
   - {Issue 1 description}
   - {Issue 2 description}
   ...

   ## SonarCloud Rules Addressed
   - {Rule ID}: {Rule description}

   ## Test plan
   - [x] TypeScript compiles
   - [x] Biome lint passes
   - [x] No behavior changes (code quality fixes only)

   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   EOF
   )"

   # Enable auto-merge (squash)
   gh pr merge --auto --squash
   ```

### 8. Summary Output

```
✅ SonarCloud Issues Fixed

📊 Batch Summary:
   - Issues fixed: {N}
   - Severity: {CRITICAL/MAJOR/MINOR}
   - Category: {category}

📁 Files Modified:
   - {file1.tsx}
   - {file2.ts}

🔗 PR Created: {PR URL}
   - Auto-merge: ENABLED

📋 Remaining Issues: {count}
   - Next batch: {description of next priority issues}
```

## Important Notes

- **Never change behavior** - Only fix code quality, not functionality
- **One category per PR** - Keep PRs focused and reviewable
- **Verify before commit** - All checks must pass
- **Auto-merge requires CI** - PR will merge when all checks pass
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