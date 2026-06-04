---
type: concept
title: Jovie Linear Fixes 2026 06 03
status: blocked
ingested_via: 'mcp:put_page'
ingested_at: '2026-06-03T21:44:55.856Z'
source_kind: 'mcp:put_page'
tags:
  - blocked
  - bug-fix
  - jovie
  - linear
  - ui-ux
---

# Jovie Linear Bug Fixes — BLOCKED (Attempt #2)

## Summary
Subagent dispatched to fix Jovie Linear issues. **Still blocked — no terminal/shell/file execution capabilities** in this subagent context.

## What Was Confirmed
- Brain identity: v0.42.8.0, postgres engine, 2989 pages
- Jovie repo source: `gstack-code-jovie-58b4de1e` at `/Users/timwhite/conductor/repos/jovie-v1` (654 pages indexed)
- The `scripts/dev-web-fast.sh` file exists in the repo (referenced in task) but is NOT indexed as a brain page — shell scripts aren't ingested as searchable pages
- Brain search does NOT return results from the jovie source for file content queries (returns default source results instead)

## What's Needed (but blocked)
1. **Terminal/shell execution** — No `terminal`, `exec`, `shell`, or file read/write tool available
2. **Git operations** — Need shell to create branches, commit, push, create PRs
3. **Code editing** — Need to read and modify `scripts/dev-web-fast.sh`
4. **Setup script** — Need to run `./scripts/setup.sh`
5. **PR creation** — Need `gh pr create`

## The Fix (for parent agent with shell access)

The known fix for JOV-2721 / JOV-2741 is straightforward:

```bash
cd /Users/timwhite/conductor/repos/jovie-v1

# 1. Setup (first time only)
./scripts/setup.sh

# 2. Create branch
git checkout -b fix/dev-web-fast-env-unset main

# 3. Fix the unbound variable error in scripts/dev-web-fast.sh
# The issue: ENV_UNSET_ARGS[@] fails with set -u when array is empty
# Fix: Use ${ENV_UNSET_ARGS[@]+"${ENV_UNSET_ARGS[@]}"} pattern
# or check with declare -p or ${#ENV_UNSET_ARGS[@]} -gt 0
```

### The Shell Fix
In `scripts/dev-web-fast.sh`, find the line that uses `ENV_UNSET_ARGS[@]` and change:

**Before:**
```bash
--env-unset "${ENV_UNSET_ARGS[@]}"
```

**After:**
```bash
${ENV_UNSET_ARGS[@]+--env-unset "${ENV_UNSET_ARGS[@]}"}
```

Or if it's used differently, the pattern to handle empty arrays with `set -u` is:
- `${array[@]+"${array[@]}"}` — expands to nothing if array is unset/empty
- Or: `(( ${#array[@]} > 0 )) && ...` to conditionally include

### After Fix
```bash
# 4. Commit and push
git add scripts/dev-web-fast.sh
git commit -m "fix: handle empty ENV_UNSET_ARGS in dev-web-fast.sh (JOV-2721, JOV-2741)"
git push -u origin fix/dev-web-fast-env-unset

# 5. Create PR
gh pr create --title "fix: handle empty ENV_UNSET_ARGS in dev-web-fast.sh" \
  --body "## Fixes
- JOV-2721: Fix dev:web:fast empty ENV_UNSET_ARGS startup path
- JOV-2741: Fix dev:web:fast empty env-unset array failure

## Root Cause
\`ENV_UNSET_ARGS[@]: unbound variable\` when array is empty with \`set -u\`

## Fix
Use bash parameter expansion to safely handle empty arrays."

# 6. For UI/UX issues, create separate branches per fix:
# JOV-2647: Normalize Library grid spacing and header alignment
# JOV-2693: Verify loading states standardization is complete
```

## Blockers
- **No terminal/shell tool** in subagent context
- **No file read/write tools** for local filesystem

## Recommendation
Parent agent (which has terminal access) should:
1. Read the current `scripts/dev-web-fast.sh` to understand exact usage of `ENV_UNSET_ARGS`
2. Apply the empty array fix shown above
3. Commit, push, create PR
4. Then address JOV-2647 (Library grid spacing) and JOV-2693 (loading states verification) in separate branches
