---
description: Multi-LLM design jury with change-aware screenshot capture
tags: [qa, swarm, design, testing]
---

# /qa-swarm-design-jury

Run the **design-jury** QA swarm recipe (GitHub #10937, related #10939).

Load `.claude/skills/qa-swarm/SKILL.md` and execute the **design-jury** workflow.

## Steps

1. Capture only screens changed by the diff (change-aware; skip unchanged surfaces).
2. Consult design-lab taste memory and benchmark comps (Linear/Superhuman/Raycast for product UI).
3. Run `/plan-design-review` and `/design-shotgun` for multi-model consensus.
4. Split objective vs taste findings; include `referenceComp` when applicable.
5. Propose:

```bash
node scripts/qa-swarm/cli.mjs propose --recipe design-jury --input /tmp/qa-swarm-findings.json
```

## Output

Ranked consensus summary plus proposed Linear issues and gbrain taste entries.