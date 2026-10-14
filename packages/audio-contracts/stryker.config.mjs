/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: 'pnpm',
  // Command runner: @stryker-mutator/vitest-runner 10.0.0 drops results for
  // tests inside `describe` blocks under vitest 5 and scored this package 0%.
  // Each mutant runs the full contract suite in a fresh vitest process.
  testRunner: 'command',
  commandRunner: {
    command:
      'node ./node_modules/vitest/vitest.mjs run --config vitest.config.mts --bail 1 --reporter dot index.test.ts analysis.test.ts beat-grid.test.ts playback.test.ts',
  },
  coverageAnalysis: 'off',
  inPlace: true,
  disableTypeChecks: false,
  reporters: ['progress', 'clear-text', 'json'],
  mutate: [
    'index.ts',
    'units.ts',
    'analysis.ts',
    'beat-grid.ts',
    'playback.ts',
    '!**/*.test.ts',
  ],
  thresholds: {
    high: 95,
    low: 85,
    break: 85,
  },
  concurrency: process.env.CI ? 2 : undefined,
};

export default config;
