import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockImplementation(
              () => mockSelect.mock.results?.[0]?.value ?? []
            ),
        }),
      };
    },
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        set: (...setArgs: unknown[]) => {
          mockSet(...setArgs);
          return {
            where: mockWhere,
          };
        },
      };
    },
  },
  doesTableExist: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/db/errors', () => ({
  isUniqueViolation: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/db/schema/content', () => ({
  discogReleases: {
    creatorProfileId: 'creatorProfileId',
    genres: 'genres',
  },
  artists: {},
  discogTracks: {},
  providerLinks: {},
  releaseArtists: {},
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    genres: 'genres',
    updatedAt: 'updatedAt',
  },
}));

vi.mock('@/lib/discography/track-provider-links', () => ({
  resolveTrackProviderLinks: vi.fn(),
}));

// The function under test uses DB queries which are mocked above.
// Instead, we test the genre aggregation logic directly by extracting it.
// Since the function is tightly coupled to DB, we test via the mock.

describe('syncProfileGenresFromReleases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aggregates genres by frequency and takes top 3', async () => {
    // Mock DB to return releases with genres
    mockSelect.mockReturnValue([
      { genres: ['rock', 'pop'] },
      { genres: ['rock', 'jazz'] },
      { genres: ['rock'] },
    ]);

    const { syncProfileGenresFromReleases } = await import(
      '@/lib/discography/queries'
    );

    await syncProfileGenresFromReleases('profile-1');

    // Verify the update was called with top 3 genres sorted by frequency
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        genres: ['rock', 'jazz', 'pop'],
      })
    );
  });

  it('handles ties with alphabetical tiebreak', async () => {
    mockSelect.mockReturnValue([{ genres: ['pop', 'rock', 'jazz', 'blues'] }]);

    const { syncProfileGenresFromReleases } = await import(
      '@/lib/discography/queries'
    );

    await syncProfileGenresFromReleases('profile-1');

    // All have count=1, so alphabetical: blues, jazz, pop
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        genres: ['blues', 'jazz', 'pop'],
      })
    );
  });

  it('normalizes genres to lowercase', async () => {
    mockSelect.mockReturnValue([
      { genres: ['Rock', 'JAZZ'] },
      { genres: ['rock', 'Pop'] },
    ]);

    const { syncProfileGenresFromReleases } = await import(
      '@/lib/discography/queries'
    );

    await syncProfileGenresFromReleases('profile-1');

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        genres: ['rock', 'jazz', 'pop'],
      })
    );
  });

  it('sets empty array when no releases have genres', async () => {
    mockSelect.mockReturnValue([]);

    const { syncProfileGenresFromReleases } = await import(
      '@/lib/discography/queries'
    );

    await syncProfileGenresFromReleases('profile-1');

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        genres: [],
      })
    );
  });

  it('handles releases with null genres gracefully', async () => {
    mockSelect.mockReturnValue([{ genres: null }, { genres: ['rock'] }]);

    const { syncProfileGenresFromReleases } = await import(
      '@/lib/discography/queries'
    );

    await syncProfileGenresFromReleases('profile-1');

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        genres: ['rock'],
      })
    );
  });

  it('caps at 3 even when more genres exist', async () => {
    mockSelect.mockReturnValue([
      { genres: ['rock', 'pop', 'jazz', 'blues', 'country'] },
      { genres: ['rock', 'pop'] },
    ]);

    const { syncProfileGenresFromReleases } = await import(
      '@/lib/discography/queries'
    );

    await syncProfileGenresFromReleases('profile-1');

    const genres = mockSet.mock.calls[0][0].genres;
    expect(genres).toHaveLength(3);
    expect(genres[0]).toBe('pop'); // count=2, alphabetically first tie
    expect(genres[1]).toBe('rock'); // count=2
    // 3rd is alphabetically first among count=1: blues
    expect(genres[2]).toBe('blues');
  });
});
