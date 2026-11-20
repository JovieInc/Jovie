// @jovie/ui mutation lane (scripts/mutation-ui.mjs, run by the rolling sweep
// with --include packages/ui/...). Mirrors apps/web/stryker.diff.config.mjs:
// the command runner re-runs this package's own vitest over the selected tests
// per mutant. Stryker itself is apps/web's pinned @stryker-mutator/core.
const testFiles = (process.env.STRYKER_TEST_FILES ?? '').trim();
if (!testFiles) {
  throw new Error('STRYKER_TEST_FILES must list the tests to run per mutant');
}
const quotedTestFiles = testFiles
  .split(/\s+/u)
  .map(file => `'${file.replaceAll("'", "'\\''")}'`)
  .join(' ');

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'command',
  commandRunner: {
    command: `node ./node_modules/vitest/vitest.mjs run --config vitest.config.mts --bail 1 --passWithNoTests=false --reporter dot ${quotedTestFiles}`,
  },
  coverageAnalysis: 'off',
  disableTypeChecks: false,
  inPlace: true,
  tempDirName: process.env.STRYKER_TEMP_DIR ?? '.stryker-tmp',
  reporters: ['clear-text', 'json'],
  jsonReporter: {
    fileName: process.env.STRYKER_REPORT_FILE ?? 'reports/mutation/ui.json',
  },
  // The sweep scores the report; a Stryker break here would hide it.
  thresholds: { high: 80, low: 60, break: null },
  concurrency:
    Number(process.env.STRYKER_CONCURRENCY) || (process.env.CI ? 4 : 2),
  timeoutMS: 60_000,
};
