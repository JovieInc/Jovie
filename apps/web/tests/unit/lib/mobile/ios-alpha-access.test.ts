import { describe, expect, it } from 'vitest';
import { resolveIOSAlphaAccess } from '@/lib/mobile/ios-alpha-access';

describe('resolveIOSAlphaAccess', () => {
  it('keeps signed-out users out of iOS install access', () => {
    expect(
      resolveIOSAlphaAccess({
        isAuthenticated: false,
        installUrl: 'https://testflight.apple.com/join/example',
      })
    ).toEqual({
      hasAccess: false,
      installUrl: null,
    });
  });

  it('allows authenticated users without an admin or rollout gate', () => {
    expect(
      resolveIOSAlphaAccess({
        isAuthenticated: true,
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
        installUrl: '',
      })
    ).toEqual({
      hasAccess: true,
      installUrl: null,
    });
  });

  it('trims install URLs before returning them', () => {
    expect(
      resolveIOSAlphaAccess({
        isAuthenticated: true,
        installUrl: '  https://testflight.apple.com/join/example  ',
      })
    ).toEqual({
      hasAccess: true,
      installUrl: 'https://testflight.apple.com/join/example',
    });
  });
});
