# Testing Optimization Plan – Progress Update

## What changed
- Set the default Vitest configuration to the optimized fast profile for local development.
- Added a dedicated `vitest.config.ci.mts` to keep the full suite (coverage, forks pool, standard setup) available for CI.
- Updated scripts so `pnpm test`/`pnpm test:fast` run the fast profile while `pnpm test:ci` targets the full suite.

## Fast profile status
- Run: `pnpm test:fast` (Vitest fast profile)
- Result: **failed** — multiple suites still require full mocks and runtime context.
- Duration: ~7m 4s
- Failure themes:
  - Route handlers expecting request context (`headers`/`cache`) and database connectivity (`DATABASE_URL` missing).
  - API/unit suites relying on full mocks for Stripe/Clerk/Next cache utilities.
  - Snapshot-style exports mismatch (atoms barrel) due to different setup path.

## Next actions
- Extend the fast setup to include lightweight mocks for `next/headers`, `next/cache`, and database/session helpers, or tag those suites to run only in the CI config.
- Revisit exclusion patterns to trim slow API suites from the fast profile while keeping core unit coverage.
- Re-run `pnpm test:fast` after tightening mocks/exclusions to target <2 minute wall-clock time.
