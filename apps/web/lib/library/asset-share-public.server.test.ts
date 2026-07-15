import { beforeEach, describe, expect, it, vi } from 'vitest';

// All DB calls are mocked — no real Postgres connection required.
const queuedRows: Array<unknown[]> = [];

function makeSelectChain() {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(queuedRows.shift() ?? []),
  };
  return chain;
}

const selectMock = vi.fn(() => makeSelectChain());

// Reference selectMock only inside a wrapper closure — the vi.mock factory
// itself is hoisted above the `const selectMock` declaration, so calling
// selectMock directly here would throw a TDZ ReferenceError.
vi.mock('@/lib/db', () => ({
  db: {
    select: () => selectMock(),
  },
}));

const shareServerMocks = vi.hoisted(() => ({
  resolveLibraryAssetShareByToken: vi.fn(),
  resolveLibraryAssetShareByPublicSlug: vi.fn(),
}));

vi.mock('./asset-share.server', () => shareServerMocks);

const merchServiceMocks = vi.hoisted(() => ({
  getLibraryMerchCardsForProfile: vi.fn(),
}));

vi.mock('@/lib/merch/service', () => merchServiceMocks);

import { buildLibraryAssetSharePublicViewByToken } from './asset-share-public.server';

function releaseSettingsRow(overrides: Record<string, unknown> = {}) {
  return {
    settings: {
      id: 'row-1',
      creatorProfileId: 'creator-1',
      assetId: 'release-1',
      itemKind: 'release',
      visibility: 'private',
      shareSlug: 'midnight-city',
      accessToken: 'valid-token',
      tokenRevokedAt: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    },
    artistHandle: 'tim',
  };
}

describe('buildLibraryAssetSharePublicViewByToken (private share access — deny without leaking)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queuedRows.length = 0;
  });

  it('returns null and never queries asset content when the token does not resolve (revoked/expired/unknown)', async () => {
    shareServerMocks.resolveLibraryAssetShareByToken.mockResolvedValue(null);

    const result =
      await buildLibraryAssetSharePublicViewByToken('revoked-token');

    expect(result).toBeNull();
    // No asset content query should ever run for a token that failed to resolve —
    // this is the "not leaked" guarantee: the denial path touches zero asset rows.
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('returns the full public view for a release on a valid, non-revoked token (happy path)', async () => {
    shareServerMocks.resolveLibraryAssetShareByToken.mockResolvedValue(
      releaseSettingsRow()
    );
    queuedRows.push([
      {
        id: 'release-1',
        title: 'Midnight City',
        artworkUrl: 'https://cdn.example.com/art.jpg',
        slug: 'midnight-city',
        artistName: 'Tim White',
        metadata: { previewUrl: 'https://cdn.example.com/preview.mp3' },
      },
    ]);

    const result = await buildLibraryAssetSharePublicViewByToken('valid-token');

    expect(result).toEqual({
      assetId: 'release-1',
      itemKind: 'release',
      title: 'Midnight City',
      artistName: 'Tim White',
      artistHandle: 'tim',
      artworkUrl: 'https://cdn.example.com/art.jpg',
      previewUrl: 'https://cdn.example.com/preview.mp3',
      smartLinkPath: '/tim/midnight-city',
      visibility: 'private',
    });
  });

  it('returns null when the resolved release row itself is missing (deleted asset, still no leak)', async () => {
    shareServerMocks.resolveLibraryAssetShareByToken.mockResolvedValue(
      releaseSettingsRow()
    );
    queuedRows.push([]); // release lookup miss

    const result = await buildLibraryAssetSharePublicViewByToken('valid-token');

    expect(result).toBeNull();
  });
});
