---
description: Read-only design audit swarm — propose Linear issues, never mutate Pen
tags: [design, swarm, audit, governance]
---

# /design-audit-swarm

Run the **design audit swarm** (JOV-13850). Read-only: files Linear issues
only; does not mutate Pen or product code.

Load `.claude/skills/design-audit-swarm/SKILL.md` and execute:

```bash
pnpm design:audit-swarm:dry
```

Review the JSON summary (`findingCount`, `proposed`, `contract.mutatesPen`).
When findings look correct and `LINEAR_API_KEY` is available, re-run without
`--dry-run` to file issues.

## Output

Print propose summary JSON. Confirm `contract.mutatesPen` is `false`.
