import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  reconcile: vi.fn(),
  entitlements: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: { select: mocks.select } }));
vi.mock('@/lib/profile-surfaces/reconciliation', () => ({
  reconcileProfileSurfaces: mocks.reconcile,
}));
vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mocks.entitlements,
}));
vi.mock('@/lib/env-public', () => ({
  publicEnv: { NEXT_PUBLIC_PROFILE_URL: 'https://jov.ie' },
}));

import { loadProfilesWorkspaceData } from './data';

function surface(id: string, artistId: string, overrides = {}) {
  return {
    id,
    kind: 'dsp',
    platform: 'spotify',
    url: `https://open.spotify.com/artist/${artistId}`,
    externalId: artistId,
    displayName: 'Spotify',
    handle: 'Spotify',
    qualificationStatus: 'qualified',
    availability: 'eligible',
    retiredAt: null,
    isOfficial: true,
    lastObservedAt: null,
    identityConfidence: '1.00',
    metadata: null,
    ...overrides,
  };
}
function setRows(surfaces: ReturnType<typeof surface>[]) {
  const responses = [
    [{ displayName: null }],
    [],
    [],
    [
      {
        username: 'tim',
        displayName: 'Canonical Name',
        avatarUrl: 'https://cdn.jov.ie/canonical.jpg',
        isPublic: true,
      },
    ],
    surfaces,
    [],
    [{ enabled: false }],
    [],
    [],
    [
      {
        providerId: 'spotify',
        externalArtistId: 'a',
        externalArtistUrl: 'https://open.spotify.com/artist/a',
        externalArtistName: 'Actual Source Name',
        externalArtistImageUrl: 'https://i.scdn.co/image/actual-a.jpg',
        updatedAt: new Date('2026-10-07T00:00:00Z'),
      },
    ],
  ];
  let index = 0;
  mocks.select.mockImplementation(() => {
    const result = responses[index++];
    if (!result) throw new Error('Unexpected DB read');
    const query = {
      from: () => query,
      where: () => query,
      innerJoin: () => query,
      orderBy: () => query,
      limit: () => query,
      then: (resolve: (value: typeof result) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    return query;
  });
}

describe('Profiles source projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.entitlements.mockResolvedValue({ profileMonitoringLimit: 5 });
    mocks.reconcile.mockResolvedValue(undefined);
  });
  it('uses an exact DSP name/photo and never assigns it to another artist on the same platform', async () => {
    setRows([surface('surface-a', 'a'), surface('surface-b', 'b')]);
    const data = await loadProfilesWorkspaceData({
      clerkUserId: 'owner',
      databaseUserId: 'owner',
      profileId: 'profile',
    });
    expect(data.rows[0]).toMatchObject({
      label: 'Actual Source Name',
      handle: null,
      identityPhoto: {
        url: 'https://i.scdn.co/image/actual-a.jpg',
        kind: 'profile',
      },
    });
    expect(data.rows[1]).toMatchObject({
      label: 'Spotify',
      handle: null,
      identityPhoto: { url: null, kind: 'missing' },
    });
    expect(data.providerAvailable).toBe(false);
    expect(mocks.reconcile).toHaveBeenCalledWith('profile');
  });
  it('keeps real handles and source metadata while search is unavailable', async () => {
    setRows([
      surface('social', 'b', {
        kind: 'social',
        platform: 'instagram',
        displayName: 'Profile Label',
        handle: '@actual',
        metadata: { ogImage: 'https://cdn.example.com/artwork.jpg' },
      }),
    ]);
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
  });
});
