---
description: Flaky-hunter swarm — rerun, cluster, and auto-quarantine stable flakes
tags: [qa, swarm, testing, ci]
---

# /qa-swarm-flaky-hunter

Run the **flaky-hunter** QA swarm recipe (GitHub #10937).

Load `.claude/skills/qa-swarm/SKILL.md` and execute the **flaky-hunter** workflow.

## Steps

1. `pnpm run test:flaky` and inspect recent CI flake output.
2. Re-run suspect tests 3x locally; confirm stable reproduction before quarantine.
3. Update `apps/web/tests/quarantine.json` only with stable repro evidence.
4. `pnpm run test:quarantine-ledger` to validate ledger shape.
5. Propose fix findings and quarantine actions:

```bash
node scripts/qa-swarm/cli.mjs propose --recipe flaky-hunter --input /tmp/qa-swarm-findings.json
```

## Output

Flake clusters, quarantine deltas, proposed Linear issues, and P0 remediation manifests.