# Ship - Pre-Merge Validation

Run the full pre-merge validation suite to ensure code is ready to ship.

This command runs:
1. TypeScript typecheck - Ensures no type errors
2. Biome - Ensures code quality and formatting (zero errors)
3. Unit tests - Runs full test suite

Execute these checks sequentially, stopping on first failure:

```bash
pnpm run typecheck && pnpm run biome:check && pnpm run test
```

## Result

After the command completes, you MUST output one of the following messages:

**If ALL checks passed (exit code 0):**

```text
============================================
  SHIP CHECK PASSED — This is ready to ship
============================================
```

**If ANY check failed (non-zero exit code):**

```text
============================================
  SHIP CHECK FAILED — Do NOT ship this
============================================
```
