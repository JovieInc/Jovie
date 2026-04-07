import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCreatorByHandle = vi.hoisted(() => vi.fn());
const mockGetFeaturedCreators = vi.hoisted(() => vi.fn());
const mockDoesTableExist = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());

vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: any[]) => any>(fn: T) => fn,
}));

vi.mock('@/lib/featured-creators', () => ({
  getCreatorByHandle: mockGetCreatorByHandle,
  getFeaturedCreators: mockGetFeaturedCreators,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
  doesTableExist: mockDoesTableExist,
  TABLE_NAMES: {
    creatorProfiles: 'creator_profiles',
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    username: 'username',
    displayName: 'displayName',
    bio: 'bio',
    avatarUrl: 'avatarUrl',
    genres: 'genres',
    isClaimed: 'isClaimed',
    spotifyPopularity: 'spotifyPopularity',
    fitScore: 'fitScore',
    isPublic: 'isPublic',
    isFeatured: 'isFeatured',
    marketingOptOut: 'marketingOptOut',
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/images/versioning', () => ({
  transformImageUrl: (url: string) => url,
}));

describe('homepage featured selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('pins Tim first and filters claimed featured candidates for future rotation', async () => {
    mockGetCreatorByHandle.mockResolvedValue({
      id: 'tim-id',
      handle: 'tim',
      name: 'Tim White',
      src: '/images/avatars/tim-white-founder.jpg',
      tagline: 'Founder',
      genres: ['Electronic'],
      latestReleaseTitle: null,
      latestReleaseType: null,
    });
    mockGetFeaturedCreators.mockResolvedValue([
      {
        id: 'tim-id',
        handle: 'tim',
        name: 'Tim White',
        src: '/images/avatars/tim-white-founder.jpg',
        tagline: 'Founder',
        genres: ['Electronic'],
        latestReleaseTitle: null,
        latestReleaseType: null,
      },
      {
        id: 'claimed-1',
        handle: 'claimed-dj',
        name: 'Claimed DJ',
        src: '/claimed-dj.jpg',
        tagline: 'Claimed',
        genres: ['Dance'],
        latestReleaseTitle: null,
        latestReleaseType: null,
      },
      {
        id: 'unclaimed-1',
        handle: 'unclaimed-dj',
        name: 'Unclaimed DJ',
        src: '/unclaimed-dj.jpg',
        tagline: 'Unclaimed',
        genres: ['House'],
        latestReleaseTitle: null,
        latestReleaseType: null,
      },
    ]);
    mockDoesTableExist.mockResolvedValue(true);
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'claimed-1',
                username: 'claimed-dj',
                displayName: 'Claimed DJ',
                bio: 'Claimed',
                avatarUrl: '/claimed-dj.jpg',
                genres: ['Dance'],
                isClaimed: true,
                spotifyPopularity: 88,
                fitScore: 92,
              },
              {
                id: 'unclaimed-1',
                username: 'unclaimed-dj',
                displayName: 'Unclaimed DJ',
                bio: 'Unclaimed',
                avatarUrl: '/unclaimed-dj.jpg',
                genres: ['House'],
                isClaimed: false,
                spotifyPopularity: 75,
                fitScore: 70,
              },
            ]),
          }),
        }),
      }),
    });

    const { resolveHomepageFeaturedCreators } = await import(
      '@/lib/homepage-featured-selection'
    );

    const result = await resolveHomepageFeaturedCreators({
      pinnedHandle: 'tim',
      limit: 3,
      includeClaimedFeaturedCandidates: true,
    });

    expect(result.pinnedCreator.handle).toBe('tim');
    expect(result.creators.map(creator => creator.handle)).toEqual([
      'tim',
      'claimed-dj',
      'unclaimed-dj',
    ]);
    expect(
      result.claimedFeaturedCandidates.map(candidate => candidate.handle)
    ).toEqual(['claimed-dj']);
  });

  it('does not query claimed featured candidates unless explicitly requested', async () => {
    mockGetCreatorByHandle.mockResolvedValue({
      id: 'tim-id',
      handle: 'tim',
      name: 'Tim White',
      src: '/images/avatars/tim-white-founder.jpg',
      tagline: 'Founder',
      genres: ['Electronic'],
      latestReleaseTitle: null,
      latestReleaseType: null,
    });
    mockGetFeaturedCreators.mockResolvedValue([
      {
        id: 'tim-id',
        handle: 'tim',
        name: 'Tim White',
        src: '/images/avatars/tim-white-founder.jpg',
        tagline: 'Founder',
        genres: ['Electronic'],
        latestReleaseTitle: null,
        latestReleaseType: null,
      },
    ]);

    const { resolveHomepageFeaturedCreators } = await import(
      '@/lib/homepage-featured-selection'
    );

    const result = await resolveHomepageFeaturedCreators({
      pinnedHandle: 'tim',
      limit: 3,
    });

    expect(result.claimedFeaturedCandidates).toEqual([]);
    expect(mockDoesTableExist).not.toHaveBeenCalled();
    expect(mockDbSelect).not.toHaveBeenCalled();
  });
});
