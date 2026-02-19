# PR Workflow Guide

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