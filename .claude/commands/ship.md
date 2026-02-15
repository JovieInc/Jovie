# Ship - Pre-Merge Validation

Run the full pre-merge validation suite to ensure code is ready to ship.

This command runs:
1. Migration guard - Validates migration journal integrity
2. Migration validation - Checks for forbidden patterns (CONCURRENTLY, etc.)
3. Drizzle migrate - Applies pending migrations to main branch
4. Drizzle check - Verifies schema matches database
5. TypeScript typecheck - Ensures no type errors
6. ESLint - Ensures code quality (zero warnings)
7. Unit tests - Runs full test suite

Execute the ship command:

```bash
pnpm run ship
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
