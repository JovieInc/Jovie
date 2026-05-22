import { describe, expect, it } from 'vitest';
import { resolveIOSAlphaAccess } from '@/lib/mobile/ios-alpha-access';

describe('resolveIOSAlphaAccess', () => {
  it('keeps signed-out users out of the iOS alpha', () => {
    expect(
      resolveIOSAlphaAccess({
        isAuthenticated: false,
        isAdmin: false,
        flagEnabled: true,
        installUrl: 'https://testflight.apple.com/join/example',
      })
    ).toEqual({
      hasAccess: false,
      installUrl: null,
    });
  });

  it('allows recently reverified admins even when the rollout gate is off', () => {
    expect(
      resolveIOSAlphaAccess({
        isAuthenticated: true,
        isAdmin: true,
        flagEnabled: false,
        installUrl: 'https://testflight.apple.com/join/example',
      })
    ).toEqual({
      hasAccess: true,
      installUrl: 'https://testflight.apple.com/join/example',
    });
  });

  it('allows signed-in users when the iOS alpha rollout gate is on', () => {
    expect(
      resolveIOSAlphaAccess({
        isAuthenticated: true,
        isAdmin: false,
        flagEnabled: true,
        installUrl: 'https://testflight.apple.com/join/example',
      })
    ).toEqual({
      hasAccess: true,
      installUrl: 'https://testflight.apple.com/join/example',
    });
  });

  it('does not expose an install URL until release plumbing provides one', () => {
    expect(
      resolveIOSAlphaAccess({
        isAuthenticated: true,
        isAdmin: true,
        flagEnabled: true,
        installUrl: '',
      })
    ).toEqual({
      hasAccess: true,
      installUrl: null,
    });
  });
});
