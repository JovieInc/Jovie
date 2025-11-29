# GitHub Merge Queue Setup

This repository is configured to support GitHub's merge queue feature for safer merging.

## What is Merge Queue?

Merge queue ensures that:

- Multiple PRs are tested together before merging
- No breaking changes slip through due to race conditions
- CI runs against the actual merge commit
- Automatic rollback if any PR in the batch fails

## Configuration Steps

### 1. Enable Merge Queue in Repository Settings

Go to **Settings > General > Pull Requests** and:

1. Check "Allow merge queue"
2. Set merge method to "Squash and merge"
3. Configure batch size (recommended: 5)

### 2. Branch Protection Rules

For both `main` and `production` branches, ensure these settings:

**Required Status Checks:**

- `ci-typecheck`
- `ci-lint`
- `ci-build`
- `ci-unit-tests`
- `pr-policy`

**Branch Protection Settings:**

- ✅ Require status checks to pass before merging
- ✅ Require branches to be up to date before merging
- ✅ Require conversation resolution before merging
- ✅ Include administrators

### 3. Merge Queue Settings

**Batch Configuration:**

- Batch size: 5 PRs maximum
- Minimum entries: 1 PR
- Maximum wait time: 5 minutes

**Merge Method:**

- Use "Squash and merge" for clean history

## How to Use

### For Regular PRs

1. Create PR against `main` branch
2. Ensure all CI checks pass
3. Get required approvals
4. Click "Merge when ready" instead of "Merge"
5. PR enters the merge queue automatically

### For Dependabot PRs

- Dependabot PRs will auto-merge via the existing workflow
- They'll use the merge queue if enabled

### For Emergency Fixes

- Use the "Merge immediately" option (admin only)
- This bypasses the queue for critical fixes

## Benefits

1. **Safer Merging**: Multiple PRs tested together
2. **No Race Conditions**: Prevents integration conflicts
3. **Better CI Efficiency**: Batched testing reduces CI load
4. **Automatic Rollback**: Failed batches don't reach production branch
5. **Queue Visibility**: See what's being tested in GitHub UI

## Monitoring

- Check the merge queue status in the GitHub UI
- Monitor CI runs for batched commits
- Review merge queue metrics in repository insights

## Troubleshooting

**Queue is stuck:**

- Check if CI is failing for the batch
- Ensure all required checks are properly configured
- Verify branch protection rules are correct

**PRs not entering queue:**

- Ensure "Merge when ready" is used instead of "Merge"
- Check that all required status checks pass
- Verify branch is up to date with base branch
