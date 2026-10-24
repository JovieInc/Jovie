/**
 * The David Guetta onboarding demo records a local video for review.
 * CI shards scan `test-results` and reject `.webm` as a forbidden container.
 * Each failed attempt retries, so one always-on recorder becomes three
 * containers and blocks the failure-artifact upload.
 */
export function onboardingDemoRecordingOptions(ci: boolean): {
  recordVideo?: {
    dir: string;
    size: { width: number; height: number };
  };
} {
  if (ci) return {};
  return {
    recordVideo: {
      dir: 'test-results',
      size: { width: 1280, height: 720 },
    },
  };
}
