---
description: Optional supplementary CodeRabbit review; use canonical internal review tooling
---

# CodeRabbit Review & Fix

CodeRabbit is optional supplementary review. The canonical policy is
`.claude/rules/code-style.md`; the existing JOV-7400 internal reviewer is the
replacement. Record internal review receipts with verified reviewed-diff/head binding and resolve
actionable findings.
Required CI, security, qualification, and merge-queue gates remain unchanged.

Run the steps below only when CodeRabbit is already available. Missing access,
rate limits, metering, or billing never block commit, publication, or merge. Do
not buy credits, configure credentials, or wait for a provider cooldown.

## Instructions

1. Run CodeRabbit CLI with `--prompt-only` flag to review uncommitted changes
2. Analyze the output and identify all issues
3. Fix each issue one by one
4. Re-run CodeRabbit to verify fixes
5. Continue until no issues remain (maximum 3 iterations to avoid excessive API usage)
6. If actionable issues remain after 3 iterations, resolve them through the normal internal review and qualification workflow

## Implementation

```bash
# Run CodeRabbit to review uncommitted changes
cr review --prompt-only -t uncommitted
```

After receiving the review:
- Carefully read each issue identified
- Apply fixes to the code
- Verify the fixes work (typecheck, lint as needed)
- Run CodeRabbit again to confirm issues are resolved
- Repeat until clean (max 3 iterations)

## Important Notes

- Use `--prompt-only` for token efficiency
- Focus on uncommitted changes with `-t uncommitted`
- Maximum 3 CodeRabbit runs to avoid excessive API usage
- If CodeRabbit is unavailable or rate-limited, record that outcome and continue with existing internal tooling; do not wait or purchase capacity
- Apply fixes methodically, one issue at a time
- Verify fixes don't break existing functionality
