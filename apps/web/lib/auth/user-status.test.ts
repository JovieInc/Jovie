import { describe, expect, it } from 'vitest';
import { determineUserStatus } from './user-status';

describe('interview admission at signup', () => {
  it.each([true, false])(
    'keeps new signups pending with gate enabled=%s',
    gate => {
      expect(determineUserStatus(undefined, undefined, gate)).toBe(
        'waitlist_pending'
      );
    }
  );

  it('preserves approved invitations and existing claimed profiles', () => {
    expect(determineUserStatus('approved-entry', undefined, true)).toBe(
      'waitlist_approved'
    );
    expect(
      determineUserStatus(
        undefined,
        { profileId: 'profile', onboardingComplete: new Date() },
        false
      )
    ).toBe('active');
    expect(
      determineUserStatus(
        undefined,
        { profileId: 'profile', onboardingComplete: null },
        false
      )
    ).toBe('onboarding_incomplete');
  });
});
