import { describe, expect, it } from 'vitest';
import {
  EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
  type OnboardingProfileBuilderState,
} from './onboardingProfileRailState';
import {
  ONBOARDING_START_STEPS,
  resolveOnboardingStartStepIndex,
} from './onboardingStartSteps';

describe('resolveOnboardingStartStepIndex', () => {
  it('starts on Find You', () => {
    expect(
      resolveOnboardingStartStepIndex(EMPTY_ONBOARDING_PROFILE_BUILDER_STATE)
    ).toBe(0);
    expect(ONBOARDING_START_STEPS[0]?.label).toBe('Find You');
  });

  it('moves to Claim Your Name once identity or a handle draft exists', () => {
    const withArtist: OnboardingProfileBuilderState = {
      ...EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
      artistConfirmed: true,
      artist: {
        id: 'a1',
        name: 'Test Artist',
        url: 'https://open.spotify.com/artist/a1',
      },
    };
    expect(resolveOnboardingStartStepIndex(withArtist)).toBe(1);

    const withHandle: OnboardingProfileBuilderState = {
      ...EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
      handle: 'testartist',
    };
    expect(resolveOnboardingStartStepIndex(withHandle)).toBe(1);
  });

  it('moves to Go Live when the handle is confirmed', () => {
    const confirmed: OnboardingProfileBuilderState = {
      ...EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
      artistConfirmed: true,
      handleConfirmed: true,
      handle: 'testartist',
      artist: {
        id: 'a1',
        name: 'Test Artist',
        url: 'https://open.spotify.com/artist/a1',
      },
    };
    expect(resolveOnboardingStartStepIndex(confirmed)).toBe(2);
    expect(ONBOARDING_START_STEPS[2]?.label).toBe('Go Live');
  });
});
