/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  disableTypeChecks: false,
  reporters: ['progress', 'clear-text', 'json'],
  mutate: [
    // JOV-4391 authority boundary: replacement owns the new element and late
    // events from the prior source cannot mutate singleton state.
    'components/organisms/release-sidebar/useTrackAudioPlayer.ts:94-95',
    'components/organisms/release-sidebar/useTrackAudioPlayer.ts:97-100',
    'components/organisms/release-sidebar/useTrackAudioPlayer.ts:401-404',
    // Equal ids only toggle when their typed source provenance also matches.
    'components/organisms/release-sidebar/useTrackAudioPlayer.ts:617-630',
    // Ephemeral preview cleanup follows the latest authority state; selection
    // forwards the complete typed source into the singleton.
    'components/organisms/GlobalAudioPreviewAction.tsx:56-65',
    'components/organisms/GlobalAudioPreviewAction.tsx:68-77',
  ],
  testFiles: [
    'tests/components/organisms/release-sidebar/useTrackAudioPlayer.test.ts',
    'tests/components/organisms/GlobalAudioPreviewAction.test.tsx',
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
  incrementalFile: 'test-results/audio-mutation/incremental.json',
  jsonReporter: {
    fileName: 'test-results/audio-mutation/stryker.json',
  },
  thresholds: {
    high: 98,
    low: 95,
    break: 98,
  },
  concurrency: process.env.CI ? 2 : 4,
};

export default config;
