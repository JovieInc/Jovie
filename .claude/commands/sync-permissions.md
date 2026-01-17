# Sync Permissions Command

Analyze session-approved commands from `.claude/settings.local.json` and suggest additions to the shared `.claude/settings.json`.

## Instructions

1. **Read Current Settings**
   - Read `.claude/settings.local.json` to find session-approved commands
   - Read `.claude/settings.json` to see current shared allowlist

2. **Analyze Local Permissions**
   - Extract all `Bash(...)` entries from the local `permissions.allow` array
   - Filter out specific commit messages and one-off commands
   - Identify generalizable patterns (e.g., `pnpm run build *`, `git fetch *`)

3. **Categorize Commands**
   - **Allow** (safe, read-only, or build commands that don't modify state):
     - `pnpm run/test/lint/build/typecheck *`
     - `pnpm exec * *`
     - `gh pr view/list/diff/checks *`
     - `git status/diff/log/show *`
   - **Prompt** (state-changing commands that need user confirmation):
     - `git add/commit/push/merge *`
     - `gh pr create/edit/merge *`
     - `pnpm add/remove *`

4. **Generate Diff**
   - Compare local patterns with shared settings
   - List commands that should be added to `bash.allow`
   - List commands that should be added to `bash.prompt`
   - Skip commands already covered by existing wildcards

5. **Update Shared Settings**
   - Edit `.claude/settings.json` to add the new patterns
   - Group similar commands together
   - Add comments if needed for clarity

6. **Summary**
   - Report how many commands were added
   - Show the diff of changes made

## Example Output

```
Analyzed 45 session-approved commands

Added to bash.allow:
  - pnpm exec playwright test *
  - pnpm run build *

Added to bash.prompt:
  - gh pr update-branch *

Skipped (already covered):
  - pnpm test * (covered by pnpm *)
  - git diff * (already present)

Updated .claude/settings.json with 3 new patterns.
```

## Notes

- Only add patterns, never remove existing ones
- Prefer broader wildcards over specific commands when safe
- Keep the settings file well-organized and readable