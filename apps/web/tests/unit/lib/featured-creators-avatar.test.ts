import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDoesTableExist = vi.hoisted(() => vi.fn());
const mockTransformImageUrl = vi.hoisted(() => vi.fn((url: string) => url));

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  unstable_cache: <T extends (...args: any[]) => any>(fn: T) => fn,
}));

vi.mock('@/lib/db', () => ({
  TABLE_NAMES: {
    creatorProfiles: 'creator_profiles',
  },
  db: {
    query: {
      discogReleases: {
        findMany: vi.fn(),
      },
    },
    select: mockDbSelect,
  },
  doesTableExist: mockDoesTableExist,
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    avatarUrl: 'avatarUrl',
    bio: 'bio',
    displayName: 'displayName',
    genres: 'genres',
    id: 'id',
    isFeatured: 'isFeatured',
    isPublic: 'isPublic',
    marketingOptOut: 'marketingOptOut',
    spotifyFollowers: 'spotifyFollowers',
    spotifyId: 'spotifyId',
    spotifyPopularity: 'spotifyPopularity',
    username: 'username',
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
  captureWarning: vi.fn(),
}));

vi.mock('@/lib/images/versioning', () => ({
  transformImageUrl: mockTransformImageUrl,
}));

function mockSelectRows(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const whereResult = {
    limit,
    orderBy: vi.fn().mockReturnValue({ limit }),
  };
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(whereResult),
    }),
  });
}

describe('featured creator avatar fallbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockDoesTableExist.mockImplementation(
      async (tableName: string) => tableName === 'creator_profiles'
    );
  });

  it('uses the canonical default avatar for featured creator rows without avatars', async () => {
    mockSelectRows([
      {
        avatarUrl: null,
        bio: 'No uploaded avatar yet',
        creatorType: 'artist',
        displayName: 'No Avatar Artist',
        genres: ['House'],
        id: 'creator_1',
        username: 'no-avatar',
      },
    ]);

    const { getFeaturedCreators } = await import('@/lib/featured-creators');

    await expect(getFeaturedCreators()).resolves.toMatchObject([
      {
        handle: 'no-avatar',
        src: '/avatars/default-user.png',
      },
    ]);
    expect(mockTransformImageUrl).toHaveBeenCalledWith(
      '/avatars/default-user.png',
      expect.objectContaining({ height: 256, width: 256 })
    );
  });

  it('uses the canonical default avatar for pinned public creators without avatars', async () => {
    mockSelectRows([
      {
        avatarUrl: null,
        bio: 'Pinned without an uploaded avatar',
        displayName: 'Pinned Artist',
        genres: ['Techno'],
        id: 'creator_2',
        username: 'pinned-artist',
      },
    ]);

    const { getCreatorByHandle } = await import('@/lib/featured-creators');

    await expect(getCreatorByHandle('pinned-artist')).resolves.toMatchObject({
      handle: 'pinned-artist',
      src: '/avatars/default-user.png',
    });
    expect(mockTransformImageUrl).toHaveBeenCalledWith(
      '/avatars/default-user.png',
      expect.objectContaining({ height: 256, width: 256 })
    );
  });
});
