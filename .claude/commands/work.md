---
description: Pick up the next unassigned Linear issue, implement it, run /ship, and open a PR via /pr. Single-issue workflow.
---

# /work — Pick Up & Ship a Linear Issue

Fetch the next unassigned issue from Linear, implement it, validate with `/ship`, and create a PR with `/pr`.

## Required Environment

```bash
node --version   # MUST be v24.x
pnpm --version   # MUST be 9.15.4
```

If wrong: `nvm use 24 && corepack prepare pnpm@9.15.4 --activate`

## Execution

### Phase 1: Intake from Linear

1. **Fetch unassigned issues:**
   - Use the `list_issues` Linear MCP tool with filters:
     - Team: `jovie`
     - States: `unstarted`, `backlog`
     - Not assigned to anyone
   - Sort by priority (urgent/high first), then by most recently created

2. **Deduplicate against open PRs:**
   ```bash
   gh pr list --state open --json headRefName --jq '.[].headRefName'
   ```
   - Skip any issue that already has a matching branch `*jov-<NUMBER>*` in the open PR list

3. **Select and confirm:**
   - Present the top candidate issue to the user with:
     - Identifier (e.g., JOV-123)
     - Title
     - Priority
     - Description summary (first 3 lines)
   - Ask: "Work on this issue? (yes / skip to next / stop)"
   - If the user skips, move to the next unassigned issue
   - If the user stops, exit the command

4. **If no unassigned issues remain**, inform the user and exit.

### Phase 2: Setup

1. **Claim the issue in Linear:**
   - Use the Linear MCP `update_issue` tool to assign the issue to the current user
   - Update the issue state to "In Progress" or "Started"

2. **Create a feature branch:**
   ```bash
   git fetch origin main
   git checkout main
   git pull origin main
   git checkout -b feat/jov-<NUMBER>-<slug>
   ```
   - Slug: lowercase title, spaces to hyphens, strip special chars, truncate to 40 chars

3. **Ensure dependencies are current:**
   ```bash
   pnpm install
   ```

### Phase 3: Implementation

1. **Understand the issue:**
   - Read the full issue description, comments, and acceptance criteria from Linear
   - Identify the affected areas of the codebase

2. **Explore relevant code:**
   - Search the codebase for files related to the issue
   - Read and understand the existing implementation

3. **Implement the fix/feature:**
   - Make minimal, focused changes that address the issue
   - Follow all codebase guardrails:
     - Never edit/delete files in `drizzle/migrations/`
     - Never create `middleware.ts` (use `apps/web/proxy.ts`)
     - Never add `// biome-ignore`
     - Use conventional commits
     - Keep marketing/legal routes fully static
     - Render global providers once in root layout only

4. **Self-review:**
   - Verify changes are minimal and correct
   - Check for any regressions or side effects

### Phase 4: Validate with /ship

Run the full pre-merge validation suite:

```
/ship
```

This executes: `pnpm run typecheck && pnpm run biome:check && pnpm run test`

- **If SHIP CHECK PASSED:** proceed to Phase 5
- **If SHIP CHECK FAILED:** fix the failing checks, then re-run `/ship`. Repeat until passing.

### Phase 5: Create PR with /pr

Run the PR creation workflow:

```
/pr
```

This will:
- Stage and commit changes with a conventional commit message
- Push the branch to origin
- Create a PR targeting `main`
- Enable auto-merge with squash

**Important:** When `/pr` generates the PR body, ensure it includes:
- `Closes JOV-<NUMBER>` in the body
- The Linear issue link
- These HTML comment markers for the `linear-sync-on-merge` workflow:
  ```html
  <!-- linear-issue-id:<LINEAR_ISSUE_UUID> -->
  <!-- linear-issue-identifier:JOV-<NUMBER> -->
  ```

### Phase 6: Linear Sync

After the PR is created:

1. **Update Linear issue state** to "In Review" using the Linear MCP `update_issue` tool
2. **Add a comment** on the Linear issue with the PR URL using the Linear MCP tools

## Error Handling

- **No unassigned issues:** Inform the user that the backlog is clear
- **Linear MCP unavailable:** Fall back to asking the user for the issue identifier manually
- **Branch already exists:** Ask the user whether to reuse or recreate
- **Validation failures:** Fix and retry up to 3 times, then report the failures and stop
- **PR creation fails:** Report the error and leave the branch for manual intervention

## Constraints

- Make minimal, correct changes — fix the issue, nothing more
- Do not skip validation — `/ship` must pass before `/pr`
- Do not proceed autonomously past issue selection — always confirm with the user
- Follow all rules from `agents.md` and `CLAUDE.md`

## Example Output

```
Fetching unassigned issues from Linear (team: jovie)...

Found 3 unassigned issues:

  JOV-247 [High] Fix avatar upload failing on mobile Safari
  "The avatar upload component throws a TypeError on iOS Safari 17+
   when selecting photos from the camera roll..."

Work on JOV-247? (yes / skip / stop)
> yes

Claiming JOV-247 and setting status to In Progress...
Creating branch: feat/jov-247-fix-avatar-upload-mobile-safari
Installing dependencies...

[Implementation work happens here]

Running /ship...
============================================
  SHIP CHECK PASSED — This is ready to ship
============================================

Running /pr...
Created PR: https://github.com/JovieInc/Jovie/pull/456
Auto-merge enabled (squash)

Updating Linear: JOV-247 → In Review
Added PR link comment to JOV-247

Done! JOV-247 is ready for review.
```
