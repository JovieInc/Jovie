/**
 * Release-lineage contracts of the structural lane. Main Health's idle probe runs
 * the same files (scripts/main-health.mjs --structural): production-release-supersession held
 * the date that expired on 2026-11-10 and failed every merge group for 8 h.
 */
export const RELEASE_LINEAGE_VITEST_TESTS = Object.freeze([
  'scripts/lib/__tests__/recheck-main-lineage-auth.test.mjs',
  'scripts/lib/__tests__/recheck-main-lineage-advancing.test.mjs',
  'scripts/lib/__tests__/production-release-supersession.test.mjs',
  'scripts/lib/__tests__/staging-controller-supersession.test.mjs',
  'scripts/lib/__tests__/staging-receipt-fetch-real-gh.test.mjs',
  'scripts/lib/__tests__/staging-generation-lineage.test.mjs',
  'scripts/lib/__tests__/release-lineage-gate.test.mjs',
  'scripts/lib/__tests__/release-risk-policy.test.mjs',
  'scripts/lib/__tests__/release-range-risk.test.mjs',
  'scripts/lib/__tests__/vitest-retry-reporter.test.mjs',
]);
