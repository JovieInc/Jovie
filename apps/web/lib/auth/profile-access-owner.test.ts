import { describe, expect, it } from 'vitest';
import { resolveProfileAccess } from './profile-access';

const actor = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const profile = '00000000-0000-4000-8000-000000000003';
const scope = {
  appUserId: actor,
  profileId: profile,
  userRows: [{ id: actor }],
  profileRows: [{ id: profile, legacyUserId: actor }],
};
describe('canonical owner claim admission', () => {
  it('rejects a removed claim even when the legacy owner still matches', () => {
    expect(
      resolveProfileAccess({ ...scope, claimRows: [], requireOwnerClaim: true })
    ).toEqual({ ok: false, reason: 'forbidden' });
    // Existing browser/session behavior is preserved by the opt-in mode.
    expect(resolveProfileAccess({ ...scope, claimRows: [] })).toMatchObject({
      ok: true,
    });
  });
  it.each([
    [{ userId: actor, role: 'manager' }],
    [{ userId: other, role: 'owner' }],
  ])('denies a non-owner claim: %j', claim => {
    expect(
      resolveProfileAccess({
        ...scope,
        claimRows: [claim],
        requireOwnerClaim: true,
      })
    ).toEqual({ ok: false, reason: 'forbidden' });
  });
  it('accepts the current canonical owner despite a stale legacy pointer', () => {
    expect(
      resolveProfileAccess({
        ...scope,
        profileRows: [{ id: profile, legacyUserId: other }],
        claimRows: [{ userId: actor, role: 'owner' }],
        requireOwnerClaim: true,
      })
    ).toEqual({ ok: true, profileId: profile, ownerUserId: actor });
  });
});
