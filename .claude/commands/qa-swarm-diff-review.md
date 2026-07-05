---
description: Multi-model PR diff-review swarm — proposes enriched Linear issues from review findings
tags: [qa, swarm, review, testing]
---

# /qa-swarm-diff-review

Run the **diff-review** QA swarm recipe (GitHub #10937).

Load `.claude/skills/qa-swarm/SKILL.md` and execute the **diff-review** workflow.

## Steps

1. Review the active branch diff against `origin/main` with `/review`.
2. Add a second-model pass on high-risk hunks (`/benchmark-models` or `/claude challenge`).
3. Collect blockers as findings (P0 for security, billing, auth, or broken core flows).
4. Write findings JSON and propose issues:

```bash
node scripts/qa-swarm/cli.mjs propose --recipe diff-review --input /tmp/qa-swarm-findings.json
```

Use `--dry-run` to validate payloads without filing Linear issues.

## Output

Print the propose summary JSON: Linear identifiers, gbrain slugs, and any P0
remediation manifest paths under `.context/qa-swarm/remediation/`.