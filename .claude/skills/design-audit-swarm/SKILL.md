---
name: design-audit-swarm
description: |
  Read-only design audit swarm (JOV-13850). Collects design-governance,
  anti-slop, fragmentation, Pen↔code parity, media-gen inventory; proposes
  Linear issues only. Never mutates Pen or product code.
version: 2026-11-20
scope: JovieInc/Jovie
owner: design-system
---

# design-audit-swarm

Audit lane for Design System Consolidation. Propose-only.

## Contract

- **May:** inventory/score drift, file Linear issues.
- **Must not:** mutate Pen, write product code, self-approve findings.
- `READ_ONLY_CONTRACT` in `scripts/design-audit-swarm/collect.mjs`.

## Run

```bash
pnpm design:audit-swarm:list
pnpm design:audit-swarm:dry
node scripts/design-audit-swarm/cli.mjs run --recipe pen-parity --dry-run
# live (LINEAR_API_KEY): node scripts/design-audit-swarm/cli.mjs run
```

## Recipes

`design-governance` · `anti-slop` · `fragmentation` · `pen-parity` · `media-gen-inventory`

## Continuous / scheduled

- Agents: `/design-audit-swarm` (prefer dry first).
- Continuous: `.github/workflows/design-governance.yml` (push/PR/dispatch —
  event-driven, no cron) runs `design:audit-swarm:dry` on the standing
  governance workflow.
