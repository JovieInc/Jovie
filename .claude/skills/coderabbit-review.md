---
description: Run CodeRabbit CLI review and fix all issues
---

# CodeRabbit Review & Fix

Run CodeRabbit CLI in the background to review uncommitted changes and fix any issues found. This workflow continues iteratively until all issues are resolved.

## Instructions

1. Run CodeRabbit CLI with `--prompt-only` flag to review uncommitted changes
2. Analyze the output and identify all issues
3. Fix each issue one by one
4. Re-run CodeRabbit to verify fixes
5. Continue until no issues remain (maximum 3 iterations to avoid excessive API usage)
6. If issues remain after 3 iterations, document them for manual review

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
- Apply fixes methodically, one issue at a time
- Verify fixes don't break existing functionality
