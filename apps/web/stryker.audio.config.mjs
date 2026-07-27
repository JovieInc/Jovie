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
    'components/organisms/release-sidebar/useTrackAudioPlayer.ts:123-124',
    'components/organisms/release-sidebar/useTrackAudioPlayer.ts:577-583',
    // Equal ids only toggle when their typed source provenance also matches.
    'components/organisms/release-sidebar/useTrackAudioPlayer.ts:832-844',
    // Ephemeral preview cleanup follows the latest authority state; selection
    // forwards the complete typed source into the singleton.
    'components/organisms/GlobalAudioPreviewAction.tsx:56-65',
    'components/organisms/GlobalAudioPreviewAction.tsx:68-77',
    // JOV-4393 keeps accepted masters separate from browser playback,
    // streams the AIFF derivative, and fails closed through every transition.
    'lib/audio/aiff-to-wav.ts',
    'lib/audio/playback-derivative.ts',
    'lib/audio/jobs/playback-derivative.ts:40-68',
    'lib/audio/jobs/playback-derivative.ts:124-133',
    'lib/audio/jobs/playback-derivative.ts:144-213',
    'lib/audio/jobs/playback-derivative.ts:224-265',
    'lib/discography/adapters.ts:79-112',
    'components/features/release/ReleaseAudioAssetPanel.tsx:274-329',
    // JOV-4392 keeps browser transcription lifecycle transitions typed,
    // rejects callbacks from replaced sessions, and records latency once.
    'lib/chat/transcriber.ts',
    // JOV-4386 keeps cue jumps and edit history sample-indexed, revision-safe,
    // queue-persistent, and observable without recording cue values.
    'components/organisms/release-sidebar/useTrackAudioPlayer.ts:358-463',
    'components/organisms/release-sidebar/useTrackAudioPlayer.ts:480-483',
    'components/organisms/release-sidebar/useTrackAudioPlayer.ts:498-500',
    'components/organisms/release-sidebar/useTrackAudioPlayer.ts:512-519',
    'components/organisms/release-sidebar/useTrackAudioPlayer.ts:544-547',
    'components/organisms/release-sidebar/useTrackAudioPlayer.ts:607-669',
    'components/organisms/release-sidebar/useTrackAudioPlayer.ts:690-705',
    'components/organisms/release-sidebar/useTrackAudioPlayer.ts:893-897',
  ],
  testFiles: [
    'tests/components/organisms/release-sidebar/useTrackAudioPlayer.test.ts',
    'tests/components/organisms/GlobalAudioPreviewAction.test.tsx',
    'lib/audio/aiff-to-wav.test.ts',
    'lib/audio/playback-derivative.test.ts',
    'lib/audio/jobs/playback-derivative.test.ts',
    'lib/discography/adapters.audio-capability.test.ts',
    'tests/components/features/release/ReleaseAudioAssetPanel.test.tsx',
    'lib/chat/transcriber.test.ts',
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
