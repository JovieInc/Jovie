import { describe, expect, it } from 'vitest';
import { onboardingDemoRecordingOptions } from '../../e2e/onboarding-demo-recording';

describe('onboardingDemoRecordingOptions', () => {
  it('does not write a webm into the scanned artifact directory in CI', () => {
    expect(onboardingDemoRecordingOptions(true)).toEqual({});
  });

  it('keeps the local review recording under test-results', () => {
    expect(onboardingDemoRecordingOptions(false)).toEqual({
      recordVideo: {
        dir: 'test-results',
        size: { width: 1280, height: 720 },
      },
    });
  });
});
