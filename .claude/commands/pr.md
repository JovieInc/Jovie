# Auto Commit & PR Command

Automatically prepare, commit, and create a PR for the current changes.

## Instructions

You are tasked with creating a complete commit-to-PR workflow. Follow these steps:

1. **Run Pre-commit Hooks**
   - Execute all lint/format hooks: `pnpm run lint --fix`
   - Run typecheck: `pnpm run typecheck`
   - Ensure all checks pass before proceeding

2. **Generate Branch Name**
   - Analyze the changes using `git diff --stat` and `git status`
   - Determine the change type: feat|fix|chore|refactor|docs|test|perf
   - Generate a concise, descriptive branch name in format: `{type}/{slug}`
   - Slug should be 3-6 words in kebab-case describing the change
   - Examples: `feat/dashboard-analytics`, `fix/auth-redirect`, `chore/update-deps`

3. **Create Feature Branch**
   - Ensure we're on main: `git checkout main`
   - Pull latest: `git pull origin main`
   - Create new branch: `git checkout -b {generated-branch-name}`

4. **Commit Changes**
   - Stage all changes: `git add -A`
   - Analyze changes to generate a commit message that:
     - Starts with the type prefix (feat|fix|chore|etc)
     - Has a concise subject line (50 chars max)
     - Includes a body explaining the "why" (1-2 sentences)
     - Ends with the co-authorship footer
   - Commit with the generated message

5. **Push Branch**
   - Push to origin with upstream tracking: `git push -u origin {branch-name}`

6. **Create Pull Request**
   - Use `gh pr create` to open a PR
   - Title: Same as commit subject line
   - Body should include:
     - ## Goal: 1-2 sentences explaining the purpose
     - ## Changes: Bullet list of key changes
     - ## Testing: How to verify the changes
     - The Claude Code footer
   - Target branch: `main`
   - Auto-assign to the current user if possible

7. **Enable Auto-Merge**
   - Enable auto-merge with squash: `gh pr merge {pr-number} --auto --squash`
   - This ensures the PR merges automatically once all checks pass

8. **Summary**
   - Output the PR URL
   - Provide a summary of what was committed and why

## Important Notes

- If typecheck or lint fails, DO NOT proceed with commit. Report errors to user.
- If there are no changes to commit, inform the user.
- If already on a feature branch (not main), ask user if they want to commit to current branch or create a new one.
- Use the same commit message format as defined in CLAUDE.md with co-authorship footer.
- Keep all git operations atomic - if any step fails, halt and report.

## Example Output

```
✅ Pre-commit checks passed
🌿 Created branch: feat/dashboard-analytics-improvements
💾 Committed changes: "feat: enhance dashboard analytics display"
🚀 Pushed to origin
🔗 Created PR: https://github.com/user/repo/pull/123
🔄 Auto-merge enabled (squash)

Summary: Added real-time analytics updates to dashboard with improved data visualization.
```
