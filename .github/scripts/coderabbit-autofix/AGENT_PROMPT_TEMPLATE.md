# CodeRabbit Autofix Agent Prompt Template

This document defines the exact prompt template used by the autofix workflow.

## Primary Fix Prompt

Used when the agent first attempts to fix CodeRabbit feedback:

```
Read the file at /tmp/coderabbit-fix-instructions.md and apply the fixes described.

After making changes, run these validation commands:
1. pnpm biome check . --write (auto-fix formatting)
2. pnpm biome check . (verify no remaining issues)
3. pnpm turbo typecheck --filter=@jovie/web (verify types)

If validation fails, analyze the errors and fix them.
Do NOT commit the changes - just make the fixes.
```

## Retry Prompt (with error context)

Used when validation fails and the agent needs to fix validation errors:

```
The previous fix attempt failed validation. Here are the errors:

```
{validation_errors}
```

Fix these validation errors. Remember:
- Make minimal changes
- Do not silence errors with comments
- Run `pnpm biome check . --write` followed by `pnpm biome check .`
- Run `pnpm turbo typecheck --filter=@jovie/web`
```

## Instructions File Format

The `/tmp/coderabbit-fix-instructions.md` file follows this structure:

```markdown
# CodeRabbit Autofix Instructions

You are fixing issues identified by CodeRabbit code review.

## CRITICAL CONSTRAINTS

1. **Minimal diff**: Make the smallest possible changes to fix the issues
2. **Only modify referenced files**: Only touch files explicitly mentioned by CodeRabbit or required by the fix
3. **Preserve formatting**: Do not reformat or restructure unrelated code
4. **No speculation**: Do not add features, refactor, or "improve" beyond the fix
5. **No dead code**: Do not introduce unused imports, variables, or functions
6. **No lint silencing**: Never use biome-ignore or similar comments to silence errors

## REVIEW SUMMARY

{review_body_from_coderabbit}

## INLINE COMMENTS (file-specific issues)

### `path/to/file.ts`:42

{comment_body}

---

### `path/to/another-file.tsx`:15

{another_comment_body}

---

## TASK

Fix ONLY the issues described above. Follow these steps:

1. Read and understand each issue
2. Make the minimal fix required
3. Run validation:
   - `pnpm biome check . --write` (auto-fix formatting)
   - `pnpm biome check .` (verify no remaining issues)
   - `pnpm turbo typecheck --filter=@jovie/web` (verify types)
4. If validation fails, fix the errors
5. Do NOT commit - the workflow will commit after successful validation
```

## Agent Constraints (Enforced via Prompt)

The agent is explicitly constrained to:

1. **Minimal diff** - Only change what's necessary
2. **File scope** - Only modify files referenced by CodeRabbit
3. **No refactoring** - Fix the issue, nothing more
4. **No dead code** - Don't add unused imports/variables
5. **No lint silencing** - Never use `biome-ignore` to hide errors
6. **Preserve architecture** - Don't restructure or reorganize
7. **Preserve formatting** - Don't reformat unrelated code

## Why These Constraints?

- **Minimal diff**: Easier to review, less risk of breaking changes
- **File scope**: Prevents scope creep and unintended side effects
- **No refactoring**: Keeps changes focused and reviewable
- **No dead code**: Maintains codebase hygiene
- **No lint silencing**: Ensures real fixes, not workarounds
- **Preserve architecture**: Respects existing design decisions
- **Preserve formatting**: Biome handles formatting separately

## Validation Pipeline

After the agent makes fixes, the workflow runs:

1. `pnpm biome check . --write` - Auto-fix any formatting issues
2. `pnpm biome check .` - Verify no lint errors remain
3. `pnpm turbo typecheck --filter=@jovie/web` - TypeScript validation

If validation fails:
- First attempt: Retry with error context
- Second attempt: Escalate to human (add `needs-human` label)
