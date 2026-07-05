---
description: Vision-critique swarm — screenshot polish scoring and jank detection
tags: [qa, swarm, design, testing]
---

# /qa-swarm-vision

Run the **vision-critique** QA swarm recipe (GitHub #10937).

Load `.claude/skills/qa-swarm/SKILL.md` and execute the **vision-critique** workflow.

## Steps

1. Capture screenshots for affected surfaces (before/after when possible).
2. Score polish 1-10; mark broken surfaces P0, janky surfaces P1/P2.
3. Run `/design-review` on objective issues; tag taste-only findings `kind: taste`.
4. Propose findings with screenshot paths in `evidencePaths`:

```bash
node scripts/qa-swarm/cli.mjs propose --recipe vision-critique --input /tmp/qa-swarm-findings.json
```

## Output

Report polish scores, proposed issues, and remediation manifests for P0 UI breaks.