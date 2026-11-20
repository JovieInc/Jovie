---
name: design-write-swarm
description: |
  Write swarm for Design System Consolidation (JOV-13851): lease → System-1
  panel → Tim-ready rename → code sync (tokens/packages/ui). Forbids
  invent-and-rubber-stamp. Dry/contract mode when live Pen is unavailable.
version: 2026-11-20
scope: JovieInc/Jovie
owner: design-system
---

# design-write-swarm

Mutating lane. Opposite of `/design-audit-swarm` (read-only).

## Contract

- **May:** edit Pen under `jovie-founder-design-studio` lease; run System-1 via
  `scripts/pen-review`; land small code sync PRs.
- **Must not:** invent design and rubber-stamp in the same turn; mutate without
  lease; treat Figma as authority; dump `*.pen` into the merge queue.
- Machine contract: `scripts/design-write-swarm/contract.mjs`.

## Attach (Tim canvas)

```bash
pen interactive -a desktop
# lock: jovie-founder-design-studio
# path: ~/Documents/Jovie/Jovie Marketing Workspace/Jovie Design Studio — canonical.lib.pen
```

Cloud agents without that desktop: **dry only**.

## Run

```bash
pnpm design:write-swarm:list
pnpm design:write-swarm:dry
pnpm design:write-swarm:test
node scripts/design-write-swarm/cli.mjs plan --live --holder <you> --scope <slice> --frames <ids>
```

Live path details: `docs/design-system/WRITE_SWARM_PATH.md`.
