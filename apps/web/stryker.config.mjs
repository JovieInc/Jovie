/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  disableTypeChecks: false,
  reporters: ['progress', 'clear-text', 'json'],
  // Critical-surface targets driven by docs/TEST_RISK_REGISTER.md.
  // Mutation testing is where coverage % stops lying about test strength —
  // assertions that exercise but don't verify are exactly what mutation
  // testing surfaces. Expand this list conservatively (one new surface per
  // quarter per the strategy in docs/TESTING_GUIDELINES.md).
  mutate: [
    // Validation + onboarding helpers (existing — pure functions, fast)
    'constants/platforms/utils.ts',
    'lib/validation/handle.ts',
    'lib/validation/username.ts',
    'lib/validation/username-core.ts',
    'lib/validation/schemas/account.ts',
    'lib/validation/schemas/onboarding.ts',
    'lib/validation/schemas/payments.ts',
    'lib/cron/auth.ts',
    'lib/onboarding/discovery-readiness.ts',
    'lib/onboarding/profile-mode-collisions.ts',
    'lib/onboarding/reserved-handle.ts',
    'lib/onboarding/return-to.ts',
    'lib/onboarding/session-keys.ts',
    // Entitlements (existing — critical gating)
    'lib/entitlements/**/*.ts',
    // Billing helpers (existing)
    'lib/billing/verified-upgrade.ts',
    'lib/stripe/connect-readiness.ts',
    'lib/stripe/plan-change.ts',
    // High-blast-radius additions per docs/TEST_RISK_REGISTER.md.
    // The heatmap currently shows 82% line coverage on the webhook route
    // but ~0% on negative paths (signature failures, replay, idempotency
    // collisions). Mutation testing will surface assertions that don't
    // exercise these branches.
    'app/api/stripe/webhooks/route.ts',
    // FAPI host decoding + Clerk env key resolution — broken auth here
    // locks out every user across all three Clerk environments.
    'lib/auth/decode-fapi-host.ts',
    'lib/auth/staging-clerk-keys.ts',
    'lib/auth/test-mode.ts',
    // Standard exclusions
    '!**/*.test.ts',
    '!**/*.test.tsx',
    '!**/*.d.ts',
  ],
  testFiles: [
    'constants/platforms/utils.fuzz.test.ts',
    'lib/cron/auth.test.ts',
    'lib/stripe/connect-readiness.test.ts',
    'tests/unit/actions/onboarding/**/*.test.ts',
    'tests/unit/lib/entitlements.server.test.ts',
    'tests/unit/lib/queries/useBillingMutations.test.tsx',
  ],
  ignorePatterns: [
    '.next',
    'coverage',
    'node_modules',
    'playwright-report',
    'test-results',
  ],
  vitest: {
    configFile: 'vitest.config.fast.mts',
  },
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  thresholds: {
    high: 80,
    low: 60,
    // Telemetry-only until baseline hotspot scores are established.
    // The workflow still preserves Stryker setup failures.
    break: 0,
  },
  concurrency: process.env.CI ? 2 : undefined,
  timeoutMS: 15000,
  dryRunTimeoutMinutes: 10,
};
