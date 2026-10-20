// Diagnostic producer for Mutation Diff only. Test discovery, projects,
// setup and aliases remain the same as the fast test runner. This receipt
// does not change or replace any normal CI coverage threshold.
import fastConfig from './vitest.config.fast.mts';

const source = process.env.STRYKER_MUTATION_SOURCE;
const reportsDirectory = process.env.STRYKER_COVERAGE_DIR;
if (!source || !reportsDirectory) {
  throw new Error('Mutation V8 receipt requires a source and output directory');
}
// Treat route segments such as [id] and (shell) as literal source paths.
const include = source.replace(/[()[\]{}*?!+@|]/gu, '\\$&');

export default {
  ...fastConfig,
  test: {
    ...fastConfig.test,
    coverage: {
      ...fastConfig.test.coverage,
      enabled: true,
      provider: 'v8',
      include: [include],
      reporter: ['json'],
      reportsDirectory,
      // This separate producer requires executed target code, not a percent.
      // Existing exact-head/nightly gate configs keep their own thresholds.
      thresholds: undefined,
    },
  },
};
