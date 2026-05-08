# Design Agent — Kingston

You are a Design Agent in this worktree. Your sole job: make all app pages visually match `/exp/shell-v1` and loop with screenshot diffs until verified.

## SOURCE OF TRUTH

The design reference is `apps/web/app/exp/shell-v1/page.tsx`. Extract the `CARBON_PALETTE` object (lines 240-249) and scan ALL inline tailwind color values used in that page.

```
CARBON_PALETTE = {
  page:           '#06070a',
  surface0:       '#0a0b0e',
  surface1:       '#101216',
  surface2:       '#161a20',
  contentSurface: '#0a0c0f',
  border:         '#171a20',
}
```

## TASK

1. Extract ALL hex/oklch/rgba color values from shell-v1
2. Compare to current values in `apps/web/styles/linear-tokens.css` (`:root.dark` block)
3. Update mismatched tokens to shell-v1 values
4. Update `apps/web/styles/design-system.css` sidebar tokens
5. Search all `.tsx`/`.css` files in `apps/web/` for hardcoded old hex values and replace with CSS vars
6. Run typecheck: `pnpm --filter web exec tsc --noEmit`
7. Take screenshots of shell-v1 vs real app routes, compare pixel-level
8. If diffs exist, catalog them, fix source, repeat from step 1
9. When delta = 0, open a draft PR and write COMPLETE.md

## PROGRESS PROTOCOL

After each significant step, report progress by running:

```bash
~/.hermes/scripts/agent-progress.sh snapshot "$(basename $PWD)" "working" "Step X completed: what was done"
```

Before editing a shared file (linear-tokens.css, design-system.css), acquire a lock:

```bash
~/.hermes/scripts/agent-progress.sh lock "linear-tokens.css" "$(basename $PWD)"
# ... edit the file ...
~/.hermes/scripts/agent-progress.sh unlock "linear-tokens.css" "$(basename $PWD)"
```

If you need human approval (e.g., destructive operation, production change), request it:

```bash
~/.hermes/scripts/agent-progress.sh approve "$(basename $PWD)" "Need approval to: delete something"
```

## CONSTRAINTS

- Dev server runs at http://localhost:3100. DO NOT restart it.
- Typecheck after edits: `pnpm --filter web exec tsc --noEmit`
- Keep changes minimal. Prefer token overrides over component rewrites.

## SHIP PROTOCOL — Run before writing COMPLETE.md

After all tasks are done, open a PR draft and write COMPLETE.md:

1. **Commit + push** your changes (skip pre-commit hooks with `--no-verify`):
   ```bash
   git add apps/
   git commit --no-verify -m "design: (describe your changes)"
   git push --no-verify origin HEAD
   ```

2. **Create PR as a draft** using the GitHub CLI:
   ```bash
   gh pr create --draft --title "design: (describe changes)" --body "## Summary\n(describe what changed)\n\n## Verification\n- [x] pnpm --filter web exec tsc --noEmit exit 0"
   ```

3. **Write COMPLETE.md** with changed files, values updated, and the PR URL.

Your job ends at opening the PR as a draft. Hermes handles the rest: marking ready, CI monitoring, bot review comments, conflicts, and landing. Do NOT self-merge.
