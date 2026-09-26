import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import {
  defineConfig,
  type TestProjectInlineConfiguration,
} from 'vitest/config';
import { readCliExcludePatterns } from '../../scripts/lib/ci-web-vitest-fast-args.mjs';
import RetryVisibilityReporter from '../../scripts/lib/vitest-retry-reporter.mjs';
import DurationShardSequencer from './scripts/vitest-duration-sequencer.mjs';

// Resolve the real filesystem path (handles Windows short-name paths like TIMWHI~1)
// so that Vite's @fs handler can locate files when the path contains spaces.
const realRoot = (() => {
  try {
    return fs.realpathSync(path.resolve(__dirname));
  } catch {
    return path.resolve(__dirname);
  }
})();
const workspaceRoot = realRoot.includes(`${path.sep}.stryker-tmp${path.sep}`)
  ? path.resolve(realRoot, '../../../..')
  : path.resolve(realRoot, '../..');

// Load environment variables from .env.test if it exists to keep parity with the
// standard configuration while using the optimized defaults locally.
dotenv.config({ path: path.resolve(realRoot, '.env.test') });

// DOM-free unit files that run in Vitest's `node` environment instead of
// paying for a fresh jsdom per file. Entries are literal file paths, or a
// directory (trailing `/`) whose every nested `*.test.ts` file is DOM-free;
// tests/unit/ci/node-environment-files.test.ts expands directories and fails
// when an entry goes stale, unsorted, or any selected file references DOM/React.
const nodeEnvironmentFiles: string[] = JSON.parse(
  fs.readFileSync(
    path.resolve(realRoot, 'tests/node-environment-files.json'),
    'utf8'
  )
);
// Escape glob syntax such as `(marketing)` and `[username]` so each entry
// matches exactly its own file or directory.
const nodeEnvironmentGlobs = nodeEnvironmentFiles.map(entry => {
  const literal = entry.replace(/[()[\]{}*?!+@|]/g, '\\$&');
  return entry.endsWith('/') ? `${literal}**/*.test.ts` : literal;
});

// Two projects over one file set. Both extend the root config below (setup
// files, aliases, excludes, timeouts); the node project narrows to the listed
// files and the jsdom project takes the rest, so root selection is unchanged.
// `--shard` partitions resolved files (DurationShardSequencer below), so each
// file still lands in exactly one CI shard.
const environmentProjects: TestProjectInlineConfiguration[] = [
  {
    extends: true,
    test: {
      name: 'node',
      environment: 'node',
      include: nodeEnvironmentGlobs,
    },
  },
  {
    extends: true,
    test: {
      name: 'jsdom',
      environment: 'jsdom',
      exclude: nodeEnvironmentGlobs,
    },
  },
];

// Detect CI environment
const isCI = process.env.CI === 'true';
const isChangedRun = process.argv.includes('--changed');
const isCoverageRun = process.argv.includes('--coverage');
const coverageInclude = (process.env.JOVIE_COVERAGE_INCLUDE ?? '')
  .split('\n')
  .map(entry => entry.trim())
  .filter(Boolean);
// The wrapper rewrites planned --changed coverage to `related`, removing
// --changed. Preserve exact-head parallelism and bounded reporters in both forms.
const isExactHeadCoverageRun =
  isCoverageRun &&
  (isChangedRun ||
    (process.argv.includes('related') && coverageInclude.length > 0));

// Vitest 4: the junit reporter's per-reporter outputFile OVERRIDES the CLI
// --outputFile flag, so sharded CI runs (the workflow passes a shard-specific
// --outputFile) all wrote the same default name that the artifact-upload glob
// never matched — failing shards uploaded no junit at all (repo #17071).
// Derive the shard path from argv the same way --changed is detected;
// VITEST_JUNIT_OUTPUT_FILE remains an explicit override for other lanes.
const shardArgv = (() => {
  const eq = process.argv.find(a => a.startsWith('--shard='));
  if (eq) return eq.slice('--shard='.length);
  const i = process.argv.indexOf('--shard');
  const next = i !== -1 ? process.argv[i + 1] : undefined;
  return next && !next.startsWith('--') ? next : null;
})();
const junitOutputFile =
  process.env.VITEST_JUNIT_OUTPUT_FILE ??
  (isCI && shardArgv
    ? `test-report.${shardArgv.replace(/\//g, '-')}.junit.xml`
    : 'test-report.junit.xml');
// Retried-then-passed tests are invisible under --retry; this sidecar JSON
// (next to the junit file) feeds the nightly Test Flakiness Report.
const flakyOutputFile = junitOutputFile.replace(
  /\.junit\.xml$|$/,
  '.flaky.json'
);

// Vitest drops CLI `--exclude` for `test.projects` (it only reaches the root
// config), so the quarantine ledger's `--exclude=<path>` flags stopped
// excluding anything once the node/jsdom projects landed and quarantined files
// ran blocking in the sharded unit run. Fold them into the root exclude that
// both projects inherit (`extends: true`).
const cliExcludePatterns = readCliExcludePatterns(process.argv);

// Changed-suite runs can fan out many short-lived workers on parity branches,
// which increases startup churn and causes timeout cascades under aggregate load.
// Keep this mode deterministic by running in a single long-lived fork with
// slightly higher global timeouts so only genuinely slow tests fail.
// Exact-head V8 coverage must stay parallel: the serial fork cannot finish
// inside GitHub merge-queue check_response_timeout_minutes=20.
const changedSuiteStabilityConfig =
  isChangedRun && !isCoverageRun
    ? {
        fileParallelism: false,
        maxWorkers: 1,
        minWorkers: 1,
        maxConcurrency: 1,
        testTimeout: 12_000,
        hookTimeout: 12_000,
        teardownTimeout: 12_000,
      }
    : {};

/**
 * Optimized Vitest Configuration for Fast Test Execution
 *
 * Configured for sub-200ms p95 performance with minimal overhead.
 * Uses optimized setup file and aggressive performance settings.
 */
export default defineConfig({
  root: realRoot,
  plugins: [react()],
  // Allow Vite's @fs handler to serve files from the real path (handles
  // Windows short-name paths like TIMWHI~1 that contain spaces when expanded).
  server: {
    fs: {
      allow: [realRoot, workspaceRoot, '..', 'C:/'],
      strict: false,
    },
  },
  test: {
    // Use optimized setup file (resolved to real path for Windows compatibility)
    setupFiles: [path.resolve(realRoot, 'tests/setup-optimized.ts')],

    // Optimized environment settings
    environment: 'jsdom',

    // Listed DOM-free files run in `node`; everything else keeps jsdom.
    projects: environmentProjects,

    // CI `--shard=n/10` balances files by measured cost
    // (tests/unit-shard-durations.json) instead of equal file counts, so no
    // single shard collects the heavy files and gates the matrix. Unsharded
    // runs keep Vitest's default ordering.
    sequence: { sequencer: DurationShardSequencer },

    // Environment variables for tests
    env: {
      // Set a test encryption key to enable proper encryption tests
      URL_ENCRYPTION_KEY: 'test-encryption-key-32-chars!!',
      // Ensure tests run in test mode
      NODE_ENV: 'test',
    },

    // Exclude slow test categories
    exclude: [
      // These suites use Node's built-in test runner and are exercised by the
      // repository's Node test lane, not Vitest's browser-oriented pipeline.
      'scripts/atomic-issue-output.test.mjs',
      'scripts/design-verify-output.test.mjs',
      'tests/e2e/**',
      'tests/eval/**',
      'tests/audit/**',
      'tests/performance/**',
      'tests/integration/**',
      'tests/**/*.nightly.test.ts',
      'tests/product-screenshots/**',
      'tests/visual-qa/**',
      // Temp Playwright comparison trees created by the artifact-secret guard.
      '.artifact-comparison-*/**',
      'node_modules/**',
      '.next/**',
      '.stryker-tmp/**',
      // Coverage runs instrument product code; this spec launches Chromium and
      // was failing the nightly heatmap for months (no browsers on that job).
      ...(isCoverageRun
        ? ['tests/unit/ci/playwright-artifact-secrets.test.ts']
        : []),
      ...cliExcludePatterns,
    ],

    // Performance optimizations
    // Use forks for better memory isolation (Vitest 4 style)
    pool: 'forks',
    isolate: true,
    singleFork: isChangedRun && !isCoverageRun,
    // CI stability: reduce memory pressure. Exact-head coverage is a single
    // merge-queue job and must use the runner instead of the serial changed
    // suite, or V8 collection overruns the 20-minute check budget.
    maxWorkers: isExactHeadCoverageRun
      ? isCI
        ? 4
        : undefined
      : isCI
        ? 2
        : undefined,
    minWorkers: 1,
    fileParallelism: isExactHeadCoverageRun ? true : !isCI,
    maxConcurrency: isExactHeadCoverageRun
      ? isCI
        ? 4
        : undefined
      : isCI
        ? 1
        : undefined,
    bail: isExactHeadCoverageRun ? 1 : 0,

    // Timeouts
    // Serial CI runs trade fan-out for determinism, so allow the same bounded
    // headroom as changed-suite runs while preserving fast local feedback.
    testTimeout: isCI ? 12_000 : 5000,
    hookTimeout: isCI ? 12_000 : 5000,
    teardownTimeout: isCI ? 12_000 : 5000,

    ...changedSuiteStabilityConfig,

    // Coverage disabled by default for speed (enable with --coverage flag).
    // Standard unit shards stay coverage-off; the separate Exact-head Coverage
    // gate and nightly heatmap own collection. Per-glob floors are the last
    // measured snapshot (2026-05-10)
    // minus 3pp so `vitest --coverage` can fail closed on critical-surface
    // decay. Register targets (90/95/85) remain the ratchet destination.
    coverage: {
      enabled: false,
      provider: 'v8',
      reporter: isExactHeadCoverageRun
        ? ['text', 'json']
        : ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      ...(coverageInclude.length > 0
        ? { include: coverageInclude, all: true }
        : {}),
      exclude: [
        'node_modules/**',
        'tests/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/coverage/**',
        '.next/**',
        'dist/**',
        '**/__generated__/**',
        '**/*.gen.ts',
        'app/**/layout.tsx',
        'app/**/loading.tsx',
        'app/**/not-found.tsx',
      ],
      // Global floors stay 0: the fast config is the merge-queue unit path
      // and must not collect coverage. Per-glob floors apply when `--coverage`
      // is passed (nightly `test:coverage`). Exact-head changed-line coverage
      // uses the 60% patch ratchet instead of those full-suite glob floors.
      thresholds: isExactHeadCoverageRun
        ? {
            lines: 0,
            branches: 0,
            functions: 0,
            statements: 0,
            perFile: false,
          }
        : {
            lines: 0,
            branches: 0,
            functions: 0,
            statements: 0,
            perFile: false,
            'lib/entitlements/**/*.ts': { branches: 68, lines: 71 },
            'app/api/stripe/webhooks/**/*.ts': { branches: 79, lines: 79 },
            'app/api/webhooks/**/*.ts': { branches: 42, lines: 48 },
            'app/api/dev/test-auth/**/*.ts': { branches: 74, lines: 85 },
            'lib/auth/test-mode.ts': { branches: 74, lines: 85 },
            'app/api/internal/ovie/summer-bottleneck/route.ts': {
              branches: 95,
              lines: 100,
            },
            'lib/ovie/summer-admissions.ts': { branches: 95, lines: 100 },
            'lib/ovie/summer-ci-audit.ts': { branches: 100, lines: 100 },
            'lib/ovie/summer-task-admissions.ts': { branches: 100, lines: 100 },
            'lib/ovie/summer-product-paths.ts': { branches: 100, lines: 100 },
            'lib/ovie/summer-shadow-client.ts': { branches: 100, lines: 100 },
          },
    },

    // Reduce reporter overhead - basic was removed in vitest 4, use default with summary:false
    // JUnit reporter in CI for Codecov Test Analytics ingestion.
    // Per-reporter outputFile wins over CLI --outputFile in Vitest 4, so the
    // shard path is derived above (--shard argv / VITEST_JUNIT_OUTPUT_FILE).
    reporters: isCI
      ? [
          ['default', { summary: false }],
          ['junit', { outputFile: junitOutputFile }],
          new RetryVisibilityReporter({
            outputFile: flakyOutputFile,
            label: shardArgv ? `shard ${shardArgv}` : '',
          }),
        ]
      : ['default'],

    // Optimize file watching
    watch: false,

    // Disable unnecessary features for speed
    globals: false,

    // Optimize dependency handling
    server: {
      deps: {
        // Inline dependencies for faster loading
        inline: ['@testing-library/react', '@testing-library/jest-dom'],
      },
    },
  },

  resolve: {
    alias: [
      {
        find: /^@\/app\/app\//,
        replacement: `${path.resolve(__dirname, './app/app')}/`,
      },
      {
        find: /^@\/app\/api\//,
        replacement: `${path.resolve(__dirname, './app/api')}/`,
      },
      {
        find: /^@\/app\/\(marketing\)\//,
        replacement: `${path.resolve(__dirname, './app/(marketing)')}/`,
      },
      {
        find: /^@\/app\/\(shell\)\//,
        replacement: `${path.resolve(__dirname, './app/app/(shell)')}/`,
      },
      {
        find: /^@\/app\//,
        replacement: `${path.resolve(__dirname, './app')}/`,
      },
      {
        find: /^@\/features\//,
        replacement: `${path.resolve(__dirname, './components/features')}/`,
      },
      {
        find: /^@\//,
        replacement: `${path.resolve(__dirname, './')}/`,
      },
      {
        find: /^@jovie\/auth-routing$/,
        replacement: path.resolve(workspaceRoot, 'packages/auth-routing'),
      },
      {
        find: /^@jovie\/auth-routing\//,
        replacement: `${path.resolve(workspaceRoot, 'packages/auth-routing')}/`,
      },
      {
        find: /^@jovie\/ui\//,
        replacement: `${path.resolve(workspaceRoot, 'packages/ui')}/`,
      },
      {
        find: /^@jovie\/ui$/,
        replacement: path.resolve(workspaceRoot, 'packages/ui'),
      },
    ],
  },

  // Build optimizations for test files
  esbuild: {
    target: 'esnext',
    format: 'esm',
  },

  // Optimize dependency pre-bundling
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@testing-library/react',
      '@testing-library/jest-dom',
    ],
  },
});
