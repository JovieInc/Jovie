import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveProfileAccess } from '@/lib/auth/profile-access';

const ROUTE_SOURCE = readFileSync(
  resolve(process.cwd(), 'app/api/chat/route.ts'),
  'utf8'
);

function getFetchArtistContextSource(): string {
  const start = ROUTE_SOURCE.indexOf('async function fetchArtistContext(');
  const end = ROUTE_SOURCE.indexOf('\n/**\n * Find a release by title', start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return ROUTE_SOURCE.slice(start, end);
}

describe('chat artist-context identity contract', () => {
  it('uses the canonical profile-access policy before loading artist context', () => {
    const source = getFetchArtistContextSource();

    expect(source).toContain('getExactProfileAccess(db, appUserId, profileId)');
    expect(source).toContain('if (!access.ok)');
    expect(source).not.toContain('users.clerkId');
    expect(source).not.toContain('creatorProfiles.userId');
  });

  it('passes the getOptionalAuth app user ID into artist-context resolution', () => {
    expect(ROUTE_SOURCE).toContain(
      'const { userId } = await getOptionalAuth()'
    );
    expect(ROUTE_SOURCE).toContain(
      'const context = await fetchArtistContext(profileId, userId)'
    );
  });

  it.each([
    { role: 'owner', name: 'canonical owner' },
    { role: 'manager', name: 'canonical manager' },
  ])('authorizes a $name even when the legacy owner differs', ({ role }) => {
    expect(
      resolveProfileAccess({
        appUserId: USER_A,
        profileId: PROFILE_ID,
        userRows: [{ id: USER_A }],
        profileRows: [{ id: PROFILE_ID, legacyUserId: USER_B }],
        claimRows: [{ userId: USER_A, role }],
      })
    ).toMatchObject({ ok: true, profileId: PROFILE_ID });
  });

  it('denies a stale legacy owner after canonical ownership transfers', () => {
    expect(
      resolveProfileAccess({
        appUserId: USER_A,
        profileId: PROFILE_ID,
        userRows: [{ id: USER_A }],
        profileRows: [{ id: PROFILE_ID, legacyUserId: USER_A }],
        claimRows: [{ userId: USER_B, role: 'owner' }],
      })
    ).toEqual({ ok: false, reason: 'forbidden' });
  });

  it.each([
    { legacyUserId: USER_B, name: 'unrelated legacy owner' },
    { legacyUserId: null, name: 'missing legacy owner' },
  ])('denies an unrelated user with $name and no claims', ({
    legacyUserId,
  }) => {
    expect(
      resolveProfileAccess({
        appUserId: USER_A,
        profileId: PROFILE_ID,
        userRows: [{ id: USER_A }],
        profileRows: [{ id: PROFILE_ID, legacyUserId }],
        claimRows: [],
      })
    ).toEqual({ ok: false, reason: 'forbidden' });
  });
});

const USER_A = '00000000-0000-4000-8000-000000000001';
const USER_B = '00000000-0000-4000-8000-000000000002';
const PROFILE_ID = '00000000-0000-4000-8000-000000000010';
