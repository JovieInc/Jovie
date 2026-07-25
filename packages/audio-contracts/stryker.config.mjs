/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  // Static registry derivations execute during module import. Running each
  // mutant against the full suite avoids false survivors from per-test module
  // caching and keeps this small contract package trustworthy.
  coverageAnalysis: 'off',
  disableTypeChecks: false,
  reporters: ['progress', 'clear-text', 'json'],
  mutate: ['index.ts', '!**/*.test.ts'],
  testFiles: ['index.test.ts'],
  vitest: {
    configFile: 'vitest.config.mts',
  },
  thresholds: {
    high: 95,
    low: 85,
    break: 85,
  },
  concurrency: process.env.CI ? 2 : undefined,
};

export default config;
