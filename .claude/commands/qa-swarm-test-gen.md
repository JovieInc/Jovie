---
description: Test generation and fuzz swarm for high-risk contracts
tags: [qa, swarm, testing]
---

# /qa-swarm-test-gen

Run the **test-gen** QA swarm recipe (GitHub #10937).

Load `.claude/skills/qa-swarm/SKILL.md` and execute the **test-gen** workflow.

## Steps

1. `pnpm --filter @jovie/web run test:nightly-agent:select` for ranked targets.
2. Generate property/integration tests for parsers, sync contracts, and entitlement states.
3. Validate candidates with focused vitest runs before keeping them.
4. File remaining gaps as `kind: coverage` findings.
5. Propose:

```bash
node scripts/qa-swarm/cli.mjs propose --recipe test-gen --input /tmp/qa-swarm-findings.json
```

## Output

List generated tests (if any), proposed coverage issues, and P0 gaps for critical paths.