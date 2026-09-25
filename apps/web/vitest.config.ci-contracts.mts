/**
 * CI contract tests (tests/unit/ci) read workflows, scripts and repo files and
 * spawn Node processes; none render DOM. Run them in the node environment with
 * no browser setup file: jsdom setup was ~46% of the structural lane's
 * tests/unit/ci run. Everything else (aliases, env, pool, timeouts,
 * reporters, excludes) is inherited from the default fast config.
 */
import baseConfig from './vitest.config.fast.mts';

export default {
  ...baseConfig,
  test: {
    ...baseConfig.test,
    environment: 'node',
    setupFiles: [],
    // Scope the config so browser-dependent suites cannot run under it.
    include: ['tests/unit/ci/**/*.test.ts'],
  },
};
