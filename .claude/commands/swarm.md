# Swarm — Parallel Agent Dispatch with Git Worktrees

Pull Linear issues and dispatch isolated agents in parallel, each in its own git worktree. Each agent ships its own PR independently with zero cross-contamination.

**Arguments:** Optional — number of issues to process (default: 5, max: 5 per batch)

## Required Environment

```bash
node --version   # MUST be v24.x
pnpm --version   # MUST be 9.15.4
```

If wrong: `nvm use 24 && corepack prepare pnpm@9.15.4 --activate`

## Execution

### Phase 1: Intake

1. **Fetch issues from Linear:**
   - Use `list_issues` MCP tool with `team: "jovie"`, states: `started`, `unstarted`, `backlog`
   - Limit to N issues (from argument or default 5)

2. **Deduplicate against open PRs:**
   ```bash
   gh pr list --state open --json headRefName --jq '.[].headRefName'
   ```
   - Skip any issue that already has a branch `tim/jov-<NUMBER>-*` in the open PR list
   - Skip any issue that is a duplicate of another issue in the batch (compare titles/descriptions)

3. **Close duplicates in Linear** if found (comment explaining which issue supersedes)

### Phase 2: Worktree Setup

For each issue, create an isolated worktree:

```bash
# Ensure main is up to date
git fetch origin main

# Create worktree with branch
git worktree add /tmp/jovie-worktrees/jov-<NUMBER> -b tim/jov-<NUMBER>-<slug> origin/main
```

**Slug generation:** lowercase issue title, spaces to hyphens, strip special chars, truncate to 40 chars.

If the worktree or branch already exists, clean up first:
```bash
git worktree remove /tmp/jovie-worktrees/jov-<NUMBER> --force 2>/dev/null
git branch -D tim/jov-<NUMBER>-<slug> 2>/dev/null
```

### Phase 3: Dispatch Agents

Spawn one agent per issue using the Task tool. All agents launch in parallel in a single message.

For each agent:
- **subagent_type:** `general-purpose`
- **mode:** `bypassPermissions`
- **model:** `sonnet` (fast, cost-effective for most issues)
- **run_in_background:** `true`
- **name:** `jov-<NUMBER>`

**Agent prompt template:**

```
You are working on Linear issue JOV-<NUMBER>: <TITLE>

WORKTREE INSTRUCTIONS (CRITICAL — read these before doing ANYTHING):

Your working directory is: /tmp/jovie-worktrees/jov-<NUMBER>
Your branch is: tim/jov-<NUMBER>-<slug>

RULES:
1. ALL file operations MUST use /tmp/jovie-worktrees/jov-<NUMBER>/ as the base path
2. ALL bash commands MUST run from /tmp/jovie-worktrees/jov-<NUMBER>/
3. NEVER cd to or modify /Users/timwhite/Documents/GitHub/TBF/Jovie (the main repo)
4. Use absolute paths: /tmp/jovie-worktrees/jov-<NUMBER>/apps/web/...

SETUP (do this first):
cd /tmp/jovie-worktrees/jov-<NUMBER> && pnpm install

CODEBASE RULES:
- Node 24.x, pnpm 9.15.4 only
- Never edit drizzle/migrations/
- Never create middleware.ts
- Never add // biome-ignore
- Use conventional commits: fix|feat|refactor: description (JOV-<NUMBER>)
- Keep changes minimal — fix the issue, nothing more

LINEAR ISSUE DETAILS:
- ID: JOV-<NUMBER>
- Title: <TITLE>
- Description: <DESCRIPTION>
- Priority: <PRIORITY>
- Labels: <LABELS>

WORKFLOW:
1. Run: cd /tmp/jovie-worktrees/jov-<NUMBER> && pnpm install
2. Read and understand the issue
3. Explore relevant code in the worktree
4. Implement the minimal fix/feature
5. Validate: cd /tmp/jovie-worktrees/jov-<NUMBER> && pnpm run typecheck && pnpm run biome:check && pnpm run test
6. If validation fails, fix issues and re-validate
7. Commit: git add <specific-files> && git commit -m "<type>: <description> (JOV-<NUMBER>)"
8. Push: git push -u origin tim/jov-<NUMBER>-<slug>
9. Create PR:
   gh pr create --title "<type>: <description> (JOV-<NUMBER>)" --body "$(cat <<'EOF'
   Closes JOV-<NUMBER>

   ## Summary
   <1-3 bullet points of what changed and why>

   ## Validation
   - [x] TypeScript typecheck passed
   - [x] Biome lint/format passed
   - [x] Unit tests passed
   EOF
   )"
10. Report back with: PR URL, summary of changes, any issues encountered
```

### Phase 4: Monitor

After dispatching all agents:

1. Wait for agents to complete (check output files periodically)
2. As each agent finishes:
   - Read its output to get the PR URL
   - Update the Linear issue status to `In Review` with PR link
   - Note any failures for retry

### Phase 5: Cleanup

After all agents complete:

```bash
# Remove all worktrees
for dir in /tmp/jovie-worktrees/jov-*/; do
  git worktree remove "$dir" --force 2>/dev/null
done

# Prune stale worktree references
git worktree prune
```

### Phase 6: Report + Loop

Print a summary table:

```markdown
## Swarm Results

| Issue | Title | Status | PR |
|-------|-------|--------|----|
| JOV-XXX | ... | Shipped | #NNNN |
| JOV-YYY | ... | Failed: typecheck | — |

Shipped: X/Y | Failed: Z | Skipped (dupes): W
```

**If more issues remain in Linear and user hasn't stopped:**
- Go back to Phase 1 and pull the next batch
- Continue until no more issues or user sends `stop`

## Error Handling

- **Agent fails validation:** Log the failure, mark issue as blocked in Linear with error details
- **Worktree creation fails:** Clean up and retry once, then skip issue
- **Agent crashes:** Read output file for error, retry once with fresh worktree
- **Branch conflict:** Delete local branch, recreate worktree from origin/main
- **pnpm install fails in worktree:** `rm -rf node_modules` in worktree and retry

## Stop Commands

The swarm loop stops when:
- User sends `stop` or `pause`
- No more issues in Linear matching the filter
- 3 consecutive batches with zero successful PRs (something is systemically wrong)
