import { getTableName } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { selectMock, matchRows, surfaceRows, reconcileMock } = vi.hoisted(
  () => ({
    selectMock: vi.fn(),
    matchRows: [] as Record<string, unknown>[],
    surfaceRows: [] as Record<string, unknown>[],
    reconcileMock: vi.fn(),
  })
);

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: { select: selectMock } }));
vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: async () => ({ profileMonitoringLimit: 10 }),
}));
vi.mock('@/lib/profile-surfaces/reconciliation', () => ({
  reconcileProfileSurfaces: reconcileMock,
}));
vi.mock('@/lib/env-public', () => ({
  publicEnv: { NEXT_PUBLIC_PROFILE_URL: 'https://jov.ie' },
}));

import { loadProfilesWorkspaceData } from './data';

const artistUrl = 'https://play.anghami.com/artist/1754494';
const reference = 'https://is1-ssl.mzstatic.com/image/reference.jpg';
const sourcePhoto = 'https://artwork.anghcdn.co/profile-observation.jpg';
const surface = {
  id: 'surface-anghami',
  creatorProfileId: 'profile-1',
  kind: 'dsp',
  platform: 'anghami',
  externalId: '1754494',
  url: artistUrl,
  canonicalUrl: artistUrl,
  normalizedUrl: artistUrl,
  displayName: 'Tim White',
  handle: null,
  qualificationStatus: 'qualified',
  isOfficial: true,
  availability: 'eligible',
  identityConfidence: null,
  metadata: {},
  lastObservedAt: null,
  retiredAt: null,
};

describe('profile workspace DSP portrait provenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    matchRows.splice(0, matchRows.length);
    surfaceRows.splice(0, surfaceRows.length, surface);
    reconcileMock.mockResolvedValue(undefined);
    selectMock.mockImplementation((fields?: Record<string, unknown>) => ({
      from: (table: Parameters<typeof getTableName>[0]) => {
        const name = getTableName(table);
        const rows =
          name === 'creator_profiles'
            ? [
                fields && 'location' in fields
                  ? { displayName: null, location: null }
                  : {
                      username: 'tim',
                      displayName: 'Tim White',
                      avatarUrl: 'https://cdn.jov.ie/tim.jpg',
                      isPublic: true,
                    },
              ]
            : name === 'profile_surfaces'
              ? surfaceRows
              : name === 'dsp_artist_matches'
                ? matchRows
                : [];
        // Return only selected columns, so missing provenance in SELECT fails.
        const projected = fields
          ? rows.map(row =>
              Object.fromEntries(
                Object.keys(fields).map(key => [
                  key,
                  (row as Record<string, unknown>)[key],
                ])
              )
            )
          : rows;
        const query = Promise.resolve(projected);
        return Object.assign(query, {
          where: () => query,
          limit: () => query,
          orderBy: () => query,
          innerJoin: () => query,
        });
      },
    }));
  });

  it('uses an exact DSP name/photo and never assigns it to another artist on the same platform', async () => {
    surfaceRows.splice(
      0,
      surfaceRows.length,
      {
        ...surface,
        id: 'surface-a',
        platform: 'spotify',
        externalId: 'a',
        url: 'https://open.spotify.com/artist/a',
        displayName: 'Spotify',
        handle: 'Spotify',
      },
      {
        ...surface,
        id: 'surface-b',
        platform: 'spotify',
        externalId: 'b',
        url: 'https://open.spotify.com/artist/b',
        displayName: 'Spotify',
        handle: 'Spotify',
      }
    );
    matchRows.push({
      providerId: 'spotify',
      externalArtistId: 'a',
      externalArtistUrl: 'https://open.spotify.com/artist/a',
      externalArtistName: 'Actual Source Name',
      externalArtistImageUrl: 'https://i.scdn.co/image/actual-a.jpg',
      matchSource: 'isrc_discovery',
      updatedAt: new Date('2026-10-07T00:00:00Z'),
    });
    const data = await loadProfilesWorkspaceData({
      clerkUserId: 'owner',
      databaseUserId: 'owner',
      profileId: 'profile',
    });
    expect(data.rows.find(row => row.id === 'surface-a')).toMatchObject({
      label: 'Actual Source Name',
      handle: null,
      identityPhoto: {
        url: 'https://i.scdn.co/image/actual-a.jpg',
        kind: 'profile',
        verified: false,
      },
    });
    expect(data.rows.find(row => row.id === 'surface-b')).toMatchObject({
      label: 'Spotify',
      handle: null,
      identityPhoto: { url: null, kind: 'missing' },
    });
    expect(data.providerAvailable).toBe(false);
    expect(reconcileMock).toHaveBeenCalledWith('profile');
  });

  it('keeps real handles and source metadata while search is unavailable', async () => {
    surfaceRows.splice(0, surfaceRows.length, {
      ...surface,
      id: 'social',
      kind: 'social',
      platform: 'instagram',
      displayName: 'Profile Label',
      handle: '@actual',
      metadata: { ogImage: 'https://cdn.example.com/artwork.jpg' },
    });
    const data = await loadProfilesWorkspaceData({
      clerkUserId: 'owner',
      databaseUserId: 'owner',
      profileId: 'profile',
    });
    expect(data.rows[0]).toMatchObject({
      label: 'Profile Label',
      handle: '@actual',
      rank: null,
      identityPhoto: { kind: 'generic', verified: false },
    });
    expect(data.providerAvailable).toBe(false);
  });

  it.each([
    ['musicfetch', reference, null],
    ['isrc_discovery', sourcePhoto, sourcePhoto],
  ])(
    'projects %s photo evidence through the actual workspace loader',
    async (matchSource, image, expected) => {
      matchRows.push({
        providerId: 'anghami',
        externalArtistId: '1754494',
        externalArtistUrl: artistUrl,
        externalArtistName: 'Tim White',
        externalArtistImageUrl: image,
        matchSource,
        updatedAt: new Date('2026-04-12T02:06:27.166Z'),
      });
      const data = await loadProfilesWorkspaceData({
        clerkUserId: 'clerk-1',
        databaseUserId: 'user-1',
        profileId: 'profile-1',
      });
      const row = data.rows.find(item => item.id === 'surface-anghami');
      if (row?.rowType !== 'surface')
        throw new Error('Expected an Anghami surface');
      expect(row.identityPhoto).toMatchObject({
        url: expected,
        verified: false,
      });
      expect(row?.url).toBe(artistUrl);
    }
  );
});
