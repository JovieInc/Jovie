/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  disableTypeChecks: false,
  reporters: ['progress', 'clear-text', 'json'],
  mutate: [
    // Canonical playback transitions: cue jumps, browser media events,
    // queue completion, and nested audio-focus interruptions.
    'components/organisms/release-sidebar/useTrackAudioPlayer.ts:263-271',
    'components/organisms/release-sidebar/useTrackAudioPlayer.ts:375-447',
    'components/organisms/release-sidebar/useTrackAudioPlayer.ts:502-541',
    'components/organisms/release-sidebar/useTrackAudioPlayer.ts:561-569',
  ],
  testFiles: [
    'tests/components/organisms/release-sidebar/useTrackAudioPlayer.test.ts',
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
