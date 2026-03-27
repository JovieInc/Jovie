import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ONBOARDING_RETURN_TO,
  normalizeOnboardingReturnTo,
} from '@/lib/onboarding/return-to';

describe('normalizeOnboardingReturnTo', () => {
  it('falls back to the default return target for missing values', () => {
    expect(normalizeOnboardingReturnTo(null)).toBe(
      DEFAULT_ONBOARDING_RETURN_TO
    );
    expect(normalizeOnboardingReturnTo(undefined)).toBe(
      DEFAULT_ONBOARDING_RETURN_TO
    );
  });

  it('preserves allowed onboarding resume targets', () => {
    expect(normalizeOnboardingReturnTo('/onboarding?resume=spotify')).toBe(
      '/onboarding?resume=spotify'
    );
    expect(
      normalizeOnboardingReturnTo('/onboarding?resume=profile-ready')
    ).toBe('/onboarding?resume=profile-ready');
  });

  it('rejects invalid and external return targets', () => {
    expect(
      normalizeOnboardingReturnTo('https://evil.com/onboarding?resume=spotify')
    ).toBe(DEFAULT_ONBOARDING_RETURN_TO);
    expect(
      normalizeOnboardingReturnTo('/onboarding-extra?resume=spotify')
    ).toBe(DEFAULT_ONBOARDING_RETURN_TO);
    expect(normalizeOnboardingReturnTo('/billing/success')).toBe(
      DEFAULT_ONBOARDING_RETURN_TO
    );
    expect(normalizeOnboardingReturnTo('/onboarding?resume=upgrade')).toBe(
      DEFAULT_ONBOARDING_RETURN_TO
    );
  });
});
