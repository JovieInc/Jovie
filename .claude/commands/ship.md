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
