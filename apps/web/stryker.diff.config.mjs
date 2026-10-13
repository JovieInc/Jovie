// Diff-scoped mutation lane (scripts/mutation-diff.mjs). Uses the command
// runner: @stryker-mutator/vitest-runner 10.0.0 drops results for tests inside
// `describe` blocks under vitest 5, which scores killed mutants as Survived.
// STRYKER_TEST_FILES is the space-separated test list the CLI computed.
const testFiles = (process.env.STRYKER_TEST_FILES ?? '').trim();
if (!testFiles) {
  throw new Error('STRYKER_TEST_FILES must list the tests to run per mutant');
}

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'command',
  commandRunner: {
    command: `node ./node_modules/vitest/vitest.mjs run --config vitest.config.fast.mts --bail 1 --reporter dot ${testFiles}`,
  },
  coverageAnalysis: 'off',
  disableTypeChecks: false,
  // Tests read repo-root files (canon/, scripts/) that a sandbox copy of
  // apps/web would not contain. Stryker restores the originals on exit.
  inPlace: true,
  reporters: ['clear-text', 'json'],
  jsonReporter: {
    fileName: process.env.STRYKER_REPORT_FILE ?? 'reports/mutation/diff.json',
  },
  // Advisory lane: scores are reported, never enforced here.
  thresholds: { high: 80, low: 60, break: null },
  concurrency: process.env.CI ? 4 : 2,
  timeoutMS: 60_000,
};
