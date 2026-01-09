# CodeRabbit Autofix System

Automated system to fix PRs blocked by CodeRabbit review feedback.

## Overview

This system eliminates human intervention for routine CodeRabbit feedback while maintaining safety, correctness, and merge determinism.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    CodeRabbit Review Event                       │
│              (pull_request_review → submitted)                   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        GUARD JOB                                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ Is CodeRabbit│ │ Is Blocking  │ │ Is Not Draft │            │
│  │   Review?    │ │   State?     │ │              │            │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘            │
│         │                │                │                      │
│         └────────────────┼────────────────┘                      │
│                          │                                       │
│                          ▼                                       │
│              ┌──────────────────────┐                           │
│              │ Retry Guard (SHA)    │                           │
│              │ Max 2 attempts/SHA   │                           │
│              └──────────┬───────────┘                           │
│                         │                                        │
│         All guards pass?│                                        │
│              ┌──────────┴──────────┐                            │
│              │ YES              NO │                            │
└──────────────┼──────────────────┼──────────────────────────────┘
               │                  │
               ▼                  ▼
┌──────────────────────┐   ┌──────────────────┐
│     AUTOFIX JOB      │   │   Skip workflow  │
│                      │   └──────────────────┘
│  1. Checkout PR      │
│  2. Mark attempt     │
│  3. Generate prompt  │
│  4. Run Claude agent │
│  5. Run validation   │
│         │            │
│    ┌────┴────┐       │
│    │         │       │
│  Pass     Fail       │
│    │         │       │
│    ▼         ▼       │
│  Commit   Retry?     │
│  & Push   (if #1)    │
│    │         │       │
│    │    ┌────┴────┐  │
│    │    │         │  │
│    │  Pass     Fail  │
│    │    │         │  │
│    │    ▼         ▼  │
│    │  Commit   Escalate │
│    │  & Push   (needs-human) │
└────┴────┴─────────┴──┘
```

## Trigger Conditions

The workflow triggers **only when ALL** conditions are true:

| Condition | Check |
|-----------|-------|
| Event type | `pull_request_review` with action `submitted` |
| Reviewer | `coderabbitai[bot]` |
| Review state | `changes_requested` (blocking) |
| PR state | Not a draft |
| Retry guard | < 2 attempts for current HEAD SHA |

## Retry Guard (Loop Safety)

### Per-SHA Tracking

Each fix attempt is tracked via labels:
- `coderabbit-autofix-attempt-{sha7}-1` - First attempt
- `coderabbit-autofix-attempt-{sha7}-2` - Second (final) attempt

### Maximum 2 Attempts Per SHA

1. **First attempt**: Agent fixes issues, validation runs
2. **If validation fails**: Retry with error context
3. **If retry fails**: Escalate to human (`needs-human` label)

### SHA Reset

When a new commit is pushed to the PR:
- New SHA = new attempt counter (starts at 0)
- Old SHA labels are cleaned up
- Fresh 2 attempts available

## Files

| File | Purpose |
|------|---------|
| `coderabbit-autofix.yml` | Main GitHub Actions workflow |
| `fetch-review.sh` | Fetches review body and inline comments |
| `generate-instructions.sh` | Generates structured agent instructions |
| `validate-fixes.sh` | Runs Biome + TypeScript validation |
| `AGENT_PROMPT_TEMPLATE.md` | Documents the exact prompts used |

## Validation Pipeline

1. **Biome auto-fix**: `pnpm biome check . --write`
2. **Biome check**: `pnpm biome check .`
3. **TypeScript**: `pnpm turbo typecheck --filter=@jovie/web`

All three must pass for fixes to be committed.

## Escalation

When automation fails:

1. `needs-human` label is added to PR
2. Comment posted explaining what happened
3. Workflow stops - no infinite loops

## Security

- **Least privilege**: Read-only permissions by default
- **Write access**: Only in autofix job, only for PR branch
- **No code execution**: Does not run untrusted PR code
- **No secret exposure**: Secrets not passed to agent prompt
- **GitHub App token**: Used for authenticated operations

## Local Testing

Test the helper scripts locally:

```bash
# Fetch review data
./fetch-review.sh owner/repo 123 456789

# Generate instructions
./generate-instructions.sh "$REVIEW_B64" "$COMMENTS_B64" /tmp/instructions.md

# Run validation
./validate-fixes.sh /tmp
```

## Monitoring

### Success Indicators

- PR has commit from `github-actions[bot]`
- Commit message: "fix: apply CodeRabbit review fixes (autofix attempt N)"
- CodeRabbit re-reviews and approves

### Failure Indicators

- `needs-human` label added
- Comment explaining failure
- No new commits after workflow run

## Troubleshooting

### Workflow not triggering

Check:
1. Is reviewer exactly `coderabbitai[bot]`?
2. Is review state `changes_requested`?
3. Is PR not a draft?
4. Has SHA exhausted retries?

### Fixes not working

Check:
1. Agent instructions in workflow logs
2. Validation output in workflow logs
3. Whether issues are fixable automatically

### Infinite loop concern

Impossible due to:
1. Per-SHA retry guard (max 2 attempts)
2. SHA changes reset counter
3. Label-based tracking is deterministic
