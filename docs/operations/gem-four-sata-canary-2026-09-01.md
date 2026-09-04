# Gem Four-SATA Canary Receipt - 2026-09-01

## Scope

- Linear issue: `JOV-5818`
- Issue title: `Ops proof: Gem four-SATA Symphony workspace routing`
- Host: `gem`
- Workspace path: `/srv/worktrees/jovie/JOV-5818`
- Current git SHA at admission proof time: `29a15fe21da3c7f0b1a6baf0d45280c6e62065c5`

This is a documentation-only operational receipt. It records that the live
official Symphony runtime admitted `JOV-5818` into the Gem workspace mounted at
`/srv/worktrees/jovie/JOV-5818`.

## Mount Evidence

Dependency-free command:

```bash
findmnt --mountpoint /srv/worktrees/jovie/JOV-5818 --output TARGET,SOURCE,FSTYPE,OPTIONS --noheadings
```

Observed output:

```text
/srv/worktrees/jovie/JOV-5818 /dev/sda1[/symphony-worktrees/jovie/JOV-5818] ext4   ro,nosuid,nodev,relatime
/srv/worktrees/jovie/JOV-5818 /dev/sda1[/symphony-worktrees/jovie/JOV-5818] ext4   rw,nosuid,nodev,relatime
```

The effective writable mount entry shows the workspace path is mounted from
device `/dev/sda1`, subpath `/symphony-worktrees/jovie/JOV-5818`.

## Allowed Shard Root Confirmation

Allowed root checked:

```text
/srv/models/symphony-worktrees/jovie/JOV-5818
```

Dependency-free commands:

```bash
findmnt --mountpoint /srv/models --output TARGET,SOURCE,FSTYPE,OPTIONS --noheadings
stat -c '%n dev=%d ino=%i type=%F' /srv/worktrees/jovie/JOV-5818 /srv/models/symphony-worktrees/jovie/JOV-5818
```

Observed output:

```text
/srv/models /dev/sda1 ext4   ro,nosuid,nodev,relatime
/srv/worktrees/jovie/JOV-5818 dev=2049 ino=33030147 type=directory
/srv/models/symphony-worktrees/jovie/JOV-5818 dev=2049 ino=33030147 type=directory
```

The workspace mount target and the allowed shard-root path have the same device
and inode (`dev=2049`, `ino=33030147`). Therefore
`/srv/worktrees/jovie/JOV-5818` is a bind-mounted workspace backed by the allowed
Gem shard root `/srv/models/symphony-worktrees/jovie/JOV-5818`.

## Dependency Policy

Dependency installation was intentionally skipped by policy. This task did not
run `pnpm install`, `pnpm fetch`, `npm install`, `yarn install`, or any other
dependency-fetch or package-hydration command. It did not create
`node_modules`, `.pnpm-store`, or a workspace-local package store.

All local checks used for this receipt are dependency-free.
