/**
 * CI contract tests (tests/unit/ci) read workflows, scripts and repo files and
 * spawn Node processes; none render DOM. Run them in the node environment with
 * no browser setup file: jsdom setup was ~46% of the structural lane's
 * tests/unit/ci run. Everything else (aliases, env, pool, timeouts,
 * reporters, excludes) is inherited from the default fast config, except its
 * node/jsdom `projects` split: projects extend this root config, so keeping
 * them would run every contract file in both projects.
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
    projects: undefined,
    // Contract tests spawn git/tar/node; on a loaded, disk-bound Mac a single
    // archive pass took 10s (JOV-7707), so the 5s unit budget timed out green
    // contracts in the pre-push structural lane.
    testTimeout: 30_000,
  },
};
