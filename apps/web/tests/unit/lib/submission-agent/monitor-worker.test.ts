import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const mockDbSelect = vi.fn();
  const mockDbInsertValues = vi.fn().mockResolvedValue(undefined);
  const mockDbInsert = vi.fn(() => ({ values: mockDbInsertValues }));
  const mockDbUpdateWhere = vi.fn().mockResolvedValue(undefined);
  const mockDbUpdateSet = vi.fn(() => ({ where: mockDbUpdateWhere }));
  const mockDbUpdate = vi.fn(() => ({ set: mockDbUpdateSet }));

  return {
    mockDbSelect,
    mockDbInsert,
    mockDbInsertValues,
    mockDbUpdate,
    mockDiscoverSubmissionTargets: vi.fn(),
    mockSnapshotAllMusicTarget: vi.fn(),
    mockSnapshotAmazonTarget: vi.fn(),
    mockGetSubmissionProvider: vi.fn(),
    mockLoadCanonicalSubmissionContext: vi.fn(),
    mockDiff: vi.fn(),
  };
});

function createSelectOrderByChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function createSelectWhereChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

function createSelectLimitChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(result),
        }),
      }),
    }),
  };
}

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.mockDbSelect,
    insert: hoisted.mockDbInsert,
    update: hoisted.mockDbUpdate,
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  asc: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock('@/lib/db/schema/metadata-submissions', () => ({
  metadataSubmissionIssues: {
    requestId: 'requestId',
    status: 'status',
    createdAt: 'createdAt',
    id: 'id',
  },
  metadataSubmissionRequests: {
    id: 'id',
    status: 'status',
    createdAt: 'createdAt',
  },
  metadataSubmissionSnapshots: {
    requestId: 'requestId',
    snapshotType: 'snapshotType',
    observedAt: 'observedAt',
    targetId: 'targetId',
  },
  metadataSubmissionTargets: {
    requestId: 'requestId',
    canonicalUrl: 'canonicalUrl',
    discoveredAt: 'discoveredAt',
    id: 'id',
  },
}));

vi.mock('@/lib/submission-agent/monitoring/discovery', () => ({
  discoverSubmissionTargets: hoisted.mockDiscoverSubmissionTargets,
}));

vi.mock('@/lib/submission-agent/monitoring/providers/allmusic', () => ({
  snapshotAllMusicTarget: hoisted.mockSnapshotAllMusicTarget,
}));

vi.mock('@/lib/submission-agent/monitoring/providers/amazon', () => ({
  snapshotAmazonTarget: hoisted.mockSnapshotAmazonTarget,
}));

vi.mock('@/lib/submission-agent/providers/registry', () => ({
  getSubmissionProvider: hoisted.mockGetSubmissionProvider,
}));

vi.mock('@/lib/submission-agent/service', () => ({
  loadCanonicalSubmissionContext: hoisted.mockLoadCanonicalSubmissionContext,
}));

describe('monitorMetadataSubmissionRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.mockDiscoverSubmissionTargets.mockResolvedValue([]);
    hoisted.mockSnapshotAllMusicTarget.mockResolvedValue(null);
    hoisted.mockSnapshotAmazonTarget.mockResolvedValue(null);
    hoisted.mockGetSubmissionProvider.mockReturnValue({
      diff: hoisted.mockDiff,
    });
    hoisted.mockLoadCanonicalSubmissionContext.mockResolvedValue({
      profileId: 'profile-1',
      artistName: 'Test Artist',
      artistBio: 'Bio',
      artistContactEmail: 'artist@example.com',
      replyToEmail: 'artist@example.com',
      release: {
        id: 'release-1',
        title: 'Target Album',
        releaseType: 'album',
        releaseDate: new Date('2026-03-01T00:00:00.000Z'),
        label: 'Label',
        upc: '123456789012',
        totalTracks: 10,
        artworkUrl: 'https://example.com/artwork.jpg',
        genres: ['indie'],
        catalogNumber: 'CAT-001',
      },
      tracks: [],
      pressPhotos: [
        {
          kind: 'press_photo',
          filename: 'press.jpg',
          mimeType: 'image/jpeg',
          url: 'https://example.com/press.jpg',
        },
      ],
    });
    hoisted.mockDiff.mockReturnValue([]);
  });

  it('does not promote a request to live without required successful target snapshots', async () => {
    hoisted.mockDbSelect
      .mockReturnValueOnce(
        createSelectOrderByChain([
          {
            id: 'request-1',
            status: 'sent',
            providerId: 'xperi_allmusic_email',
            creatorProfileId: 'profile-1',
            releaseId: 'release-1',
            createdAt: new Date('2026-03-01T00:00:00.000Z'),
          },
        ])
      )
      .mockReturnValueOnce(
        createSelectWhereChain([
          {
            id: 'target-release',
            requestId: 'request-1',
            targetType: 'allmusic_release_page',
            canonicalUrl: 'https://www.allmusic.com/album/wrong-one',
            externalId: null,
            discoveredAt: new Date('2026-03-01T00:00:00.000Z'),
          },
          {
            id: 'target-artist',
            requestId: 'request-1',
            targetType: 'allmusic_artist_page',
            canonicalUrl: 'https://www.allmusic.com/artist/test-artist',
            externalId: null,
            discoveredAt: new Date('2026-03-01T00:00:00.000Z'),
          },
        ])
      )
      .mockReturnValueOnce(
        createSelectWhereChain([
          {
            id: 'target-release',
            requestId: 'request-1',
            targetType: 'allmusic_release_page',
            canonicalUrl: 'https://www.allmusic.com/album/wrong-one',
            externalId: null,
            discoveredAt: new Date('2026-03-01T00:00:00.000Z'),
          },
          {
            id: 'target-artist',
            requestId: 'request-1',
            targetType: 'allmusic_artist_page',
            canonicalUrl: 'https://www.allmusic.com/artist/test-artist',
            externalId: null,
            discoveredAt: new Date('2026-03-01T00:00:00.000Z'),
          },
        ])
      )
      .mockReturnValueOnce(
        createSelectLimitChain([
          {
            normalizedData: {
              releaseTitle: 'Target Album',
              hasBio: true,
              hasArtistImage: true,
            },
          },
        ])
      );

    const { monitorMetadataSubmissionRequests } = await import(
      '@/lib/submission-agent/monitor-worker'
    );
    const results = await monitorMetadataSubmissionRequests({
      requestIds: ['request-1'],
    });

    expect(results).toEqual([
      {
        requestId: 'request-1',
        status: 'sent',
        targets: 2,
        issues: 0,
      },
    ]);
    expect(hoisted.mockDbUpdate).not.toHaveBeenCalled();
    expect(hoisted.mockDbInsert).not.toHaveBeenCalled();
    expect(hoisted.mockSnapshotAllMusicTarget).toHaveBeenCalledTimes(2);
  });
});
