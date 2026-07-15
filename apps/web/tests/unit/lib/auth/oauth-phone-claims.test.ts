import { describe, expect, it } from 'vitest';
import { getOAuthPhoneClaims } from '@/lib/auth/oauth-phone-claims';

describe('getOAuthPhoneClaims', () => {
  it('releases a verified phone number for the phone scope', () => {
    expect(
      getOAuthPhoneClaims(
        { phoneNumber: '+14155551212', phoneNumberVerified: true },
        ['openid', 'phone']
      )
    ).toEqual({
      phone_number: '+14155551212',
      phone_number_verified: true,
    });
  });

  it('does not release the phone number without the phone scope', () => {
    expect(
      getOAuthPhoneClaims(
        { phoneNumber: '+14155551212', phoneNumberVerified: true },
        ['openid', 'profile']
      )
    ).toEqual({});
  });

  it('does not emit an empty phone claim', () => {
    expect(
      getOAuthPhoneClaims({ phoneNumber: null, phoneNumberVerified: false }, [
        'openid',
        'phone',
      ])
    ).toEqual({});
  });
});
