---
description: Parallel agent orchestration using git worktrees for isolated branch work. Use when spawning multiple agents to work on separate Linear issues simultaneously. Prevents branch conflicts, dirty tree cross-contamination, and commit pollution.
---

# Parallel Agent Orchestration with Git Worktrees

## Mission

Orchestrate multiple agents working on separate Linear issues in parallel, using git worktrees so each agent has a completely isolated working directory. Turbo 2.8+ automatically shares build cache across worktrees.

## When to Use

- Spawning 2+ agents to work on different issues simultaneously
- Any time agents would otherwise share the main repo's git state
- Batch processing Linear backlog items

## Constraints

- **Max 5 concurrent agents** (memory/CPU — see agents.md OOM guidance)
- **Node 24.x** and **pnpm 9.15.4** required in each worktree
- Never edit/delete files in `drizzle/migrations/` without coordination
- Each agent creates its own PR — no shared branches

## Worktree Lifecycle

### 1. Create Worktree

```bash
# From main repo root — ensure main is up to date first
git fetch origin main
git worktree add /tmp/jovie-worktrees/jov-<ISSUE_NUMBER> -b tim/jov-<ISSUE_NUMBER>-<slug> origin/main
```

- Location: `/tmp/jovie-worktrees/jov-<ISSUE_NUMBER>/`
- Uses `/tmp` so it's auto-cleaned on reboot
- Named by issue number for easy identification
- Branch from `origin/main` to get latest

### 2. Initialize Worktree

```bash
cd /tmp/jovie-worktrees/jov-<ISSUE_NUMBER>
pnpm install  # ~20s with pnpm's content-addressable store (hard-links)
```

Turbo cache is shared automatically — no configuration needed.

### 3. Agent Does Work

The agent works entirely within its worktree directory. All file reads, edits, and bash commands use the worktree path.

### 4. Validate

```bash
cd /tmp/jovie-worktrees/jov-<ISSUE_NUMBER>
pnpm run typecheck && pnpm run biome:check && pnpm run test
```

### 5. Commit + Push + PR

```bash
cd /tmp/jovie-worktrees/jov-<ISSUE_NUMBER>
git add <specific-files>
git commit -m "fix: description of change (JOV-XXX)"
git push -u origin tim/jov-<ISSUE_NUMBER>-<slug>
gh pr create --title "fix: description (JOV-XXX)" --body "Closes JOV-XXX\n\n## Summary\n..."
```

### 6. Cleanup

```bash
# From main repo root (NOT from the worktree)
git worktree remove /tmp/jovie-worktrees/jov-<ISSUE_NUMBER> --force
```

## Agent Prompt Template

When spawning an agent for a Linear issue, include this in the prompt:

```
WORKTREE INSTRUCTIONS (CRITICAL — read before doing anything):

Your working directory is: /tmp/jovie-worktrees/jov-<NUMBER>
Your branch is: tim/jov-<NUMBER>-<slug>

1. ALL file operations MUST use /tmp/jovie-worktrees/jov-<NUMBER> as the base path
2. ALL bash commands MUST cd to /tmp/jovie-worktrees/jov-<NUMBER> first
3. NEVER cd to or modify the main repo (use `git rev-parse --show-toplevel` to locate it if needed)
4. Run `pnpm install` before starting work (one-time, ~20s)
5. After implementation, run: pnpm run typecheck && pnpm run biome:check && pnpm run test
6. Commit with conventional commit format: fix|feat|refactor: description (JOV-<NUMBER>)
7. Push and create PR: git push -u origin <branch> && gh pr create
8. Report back: PR URL + summary of changes

LINEAR ISSUE:
- ID: JOV-<NUMBER>
- Title: <title>
- Description: <description>
```

## Anti-Patterns

| Wrong | Correct | Why |
|-------|---------|-----|
| `cd <main-repo-root>` from agent | Stay in `/tmp/jovie-worktrees/jov-XXX` | Main repo is shared — touching it causes conflicts |
| `git checkout` in main repo while agents run | Only use worktrees for branch work | Checkout in main would affect all agents reading from it |
| Sharing `node_modules` between worktrees | Each worktree runs `pnpm install` | pnpm hard-links from store — fast and isolated |
| More than 5 concurrent agents | Batch in groups of 5 | Memory/CPU constraints cause OOM |
| Using `git worktree add` without `origin/main` | Always base on `origin/main` | Ensures each worktree starts from latest main |
| Running worktree cleanup from inside the worktree | Run from main repo root | Can't remove a worktree you're inside |

## Lead Agent Orchestration Pattern

```
1. Fetch issues from Linear (list_issues with team/state filters)
2. Deduplicate against open PRs (gh pr list)
3. For each issue (max 5 at a time):
   a. Create worktree: git worktree add /tmp/jovie-worktrees/jov-XXX -b tim/jov-XXX-slug origin/main
   b. Spawn agent with Task tool:
      - subagent_type: "general-purpose"
      - mode: "bypassPermissions"
      - Include worktree instructions + Linear issue details in prompt
   c. Track agent task ID
4. Wait for agents to complete (they report back with PR URLs)
5. Update Linear issues with PR links
6. Clean up worktrees
7. If more issues remain, repeat from step 1
```

## Troubleshooting

### Worktree already exists
```bash
git worktree remove /tmp/jovie-worktrees/jov-XXX --force
# Then recreate
```

### Branch already exists
```bash
git branch -D tim/jov-XXX-slug  # Delete local branch
git worktree add /tmp/jovie-worktrees/jov-XXX -b tim/jov-XXX-slug origin/main
```

### pnpm install fails in worktree
```bash
cd /tmp/jovie-worktrees/jov-XXX
rm -rf node_modules apps/web/node_modules packages/ui/node_modules
pnpm install
```

### Agent's typecheck/lint fails
The agent should fix issues in its worktree. If it can't, it reports failure and the lead agent handles it or marks the issue as blocked.
