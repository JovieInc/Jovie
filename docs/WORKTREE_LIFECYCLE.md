# Worktree lifecycle policy

This policy keeps Jovie/Hermes/Gem worktrees bounded without deleting work that may still matter.

## Required metadata

Every worktree created for an agent run must contain `.worktree-owner.json` at its root:

```json
{
  "schema_version": 1,
  "owner": "gem|summer|<agent>",
  "run_id": "<unique-run-id>",
  "created_at": "2026-07-10T00:00:00Z",
  "last_activity_at": "2026-07-10T00:00:00Z",
  "named_user": false
}
```

Register immediately after `git worktree add`:

```bash
node scripts/worktree-lifecycle.mjs register "$WORKTREE" \
  --owner "$OWNER" --run-id "$RUN_ID"
```

Use `--named-user` for a user-named/persistent worktree. A non-`unclaimed` owner is treated as claimed. Agents should update `last_activity_at` when handing off or renewing a run. Never edit another agent's metadata to make it reaper-eligible.

## Deterministic commands

Inventory is always safe and emits JSON:

```bash
node scripts/worktree-lifecycle.mjs inventory --root "$REPO" \
  --report "$HOME/.cache/jovie/worktree-lifecycle/latest.json"
```

The reaper defaults to dry-run. Applying is explicit:

```bash
node scripts/worktree-lifecycle.mjs reap --root "$REPO" --apply \
  --report "$HOME/.cache/jovie/worktree-lifecycle/latest.json"
```

The reaper removes only worktrees that are clean, metadata-valid, `owner=unclaimed`, past TTL, and have no active process. It never removes dirty, locked, active-process, named-user, claimed, missing-metadata, prunable, detached-current-main, or current-main worktrees. After at least one confirmed removal it runs `git worktree prune`.

## TTL and disk pressure

Defaults are 14 days of inactivity, 3 days when free disk is at or below 20 GiB, and 1 day at or below 10 GiB. The report includes the effective TTL and an `ALERT_SUMMER`/`alert` field when pressure tightens policy. Disk-pressure alerts are for Summer to coordinate; they do not authorize deleting protected worktrees.

## Scheduled cleanup

`scripts/worktree-lifecycle-cron.sh` is a low-cost, lock-protected apply wrapper. Install it only on hosts where the repository root is stable (local Mac and Gem are appropriate); keep the first runs dry-run-only and inspect the JSON artifact. Example launchd/systemd scheduling should run no more than hourly; the process performs one `git worktree list`, status checks, and a bounded `lsof` probe.

The scheduler is fail-closed: missing metadata, command failures, locks, dirty state, active processes, and named-user worktrees are retained.
