# PR Workflow Guide

## Linear State Flow

Every PR tied to a Linear issue follows this three-state flow:

```
Todo → [agent: In Progress] → [PR opened: In Review] → [PR merged: Done]
         ^ manual              ^ auto (orchestrator)    ^ auto (sync-on-merge)
```

- **In Progress** — the agent marks the issue before editing files. Dispatched work (via `linear-ai-orchestrator.yml`) sets this automatically; ad-hoc work is the agent's responsibility. See `AGENTS.md` → "Linear Ownership Contract".
- **In Review** — `.github/workflows/linear-ai-orchestrator.yml` (`sync_linear_in_review` job) sets this when the PR is opened.
- **Done** — `.github/workflows/linear-sync-on-merge.yml` sets this when the PR merges.

**Troubleshooting**: if the auto-transitions don't fire, the issue→PR link is broken. Verify:

1. The PR body contains `<!-- linear-issue-id:... -->` (injected by `.github/workflows/auto-pr-on-push.yml`), OR
2. The branch name contains `jov-NNNN` (e.g., `codex/jov-1433-foo`, `itstimwhite/jov-1433-foo`).

If neither is present, the workflows cannot find the Linear issue and state stays stuck.

## Creating PRs with Auto-merge

### Option 1: Helper Script (Recommended)
```bash
./scripts/create-pr.sh "feat: add user authentication" "Implement OAuth login with Google and GitHub providers"
```

### Option 2: Manual with gh CLI
```bash
# Create PR
gh pr create --title "feat: add user auth" --body "Implement OAuth login"

# Add auto-merge label
gh pr edit <PR_NUMBER> --add-label "auto-merge"
```

## Auto-merge Behavior

The auto-merge workflow will:

✅ **Enable auto-merge for PRs with `auto-merge` label when:**
- All CI checks pass
- PR is not draft
- No blocking labels (`blocked`, `human-review`, `no-auto-merge`, etc.)

⏸️ **Skip auto-merge for PRs with these labels:**
- `blocked` - PR is blocked
- `human-review` - Needs human review
- `no-auto-merge` - Explicitly disable auto-merge
- `claude:needs-fixes` - Claude detected issues
- `needs-human` - Requires human intervention

## PR Types

### Regular PRs (like Claude Code creates)
- ✅ **Auto-merge**: Only if `auto-merge` label is present
- 🔄 **Merge method**: Squash and merge
- ⚡ **CI requirements**: Fast checks (lint, typecheck)

### Special PR Types
- **Dependabot**: Auto-merge for patch/minor updates and security fixes
- **Codegen**: Auto-merge with `codegen` label
- **Production promotion**: Manual merge only (no auto-merge)

## Best Practices

1. **Always add `auto-merge` label** when creating PRs via Claude Code
2. **Use conventional commit format** in PR titles
3. **Add blocking labels** if PR needs human review
4. **Monitor CI status** - auto-merge only triggers after green CI

## Troubleshooting

### Auto-merge not triggering?
- Check if PR has `auto-merge` label
- Verify CI checks are passing
- Ensure no blocking labels are present
- Check workflow logs in GitHub Actions

### Need to disable auto-merge?
```bash
gh pr edit <PR_NUMBER> --add-label "no-auto-merge"
```