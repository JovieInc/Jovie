import { describe, expect, it } from 'vitest';
import { resolveProfileAccess } from './profile-access';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const PROFILE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function resolve(
  claims: Array<{ userId: string; role: string }> = [],
  legacyUserId: string | null = USER_A
) {
  return resolveProfileAccess({
    appUserId: USER_A,
    profileId: PROFILE,
    userRows: [{ id: USER_A }],
    profileRows: [{ id: PROFILE, legacyUserId }],
    claimRows: claims,
  });
}

describe('resolveProfileAccess', () => {
  it.each(['owner', 'manager'])('allows the exact %s claim', role => {
    expect(resolve([{ userId: USER_A, role }])).toEqual({
      ok: true,
      profileId: PROFILE,
    });
  });

  it('fails closed instead of using stale legacy ownership after cutover', () => {
    expect(resolve([{ userId: USER_B, role: 'owner' }])).toEqual({
      ok: false,
      reason: 'forbidden',
    });
  });

  it('uses legacy ownership only when the exact target has no claims', () => {
    expect(resolve()).toEqual({ ok: true, profileId: PROFILE });
    expect(resolve([], USER_B)).toEqual({
      ok: false,
      reason: 'forbidden',
    });
  });

  it('fails closed on ambiguous canonical claims', () => {
    expect(
      resolve([
        { userId: USER_A, role: 'owner' },
        { userId: USER_A, role: 'manager' },
      ])
    ).toEqual({ ok: false, reason: 'ambiguous' });
  });
});
