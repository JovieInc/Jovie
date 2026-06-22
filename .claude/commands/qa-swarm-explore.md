---
description: Exploratory test swarm for web browse/QA and iOS driver flows
tags: [qa, swarm, testing, browse]
---

# /qa-swarm-explore

Run the **exploratory test** QA swarm recipe (GitHub #10937).

Load `.claude/skills/qa-swarm/SKILL.md` and execute the **explore** workflow.

## Steps

1. `pnpm run dev:web:browse`
2. Auth: `/api/dev/test-auth/enter?persona=creator-ready&redirect=/app`
3. Run `/qa --quick` on changed routes; extend with `/browse` for goal-driven flows.
4. For iOS-touching diffs, run `/ios-qa` when a build is available.
5. Propose findings:

```bash
node scripts/qa-swarm/cli.mjs propose --recipe explore --input /tmp/qa-swarm-findings.json
```

## Output

Report proposed Linear issues, gbrain pages, and P0 remediation manifests.