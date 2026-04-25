import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  returningMock: vi.fn(),
  valuesMock: vi.fn(),
  insertMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: hoisted.insertMock,
  },
}));

describe('createManagedRelease', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-24T12:00:00.000Z'));

    hoisted.returningMock.mockResolvedValue([
      {
        id: 'release_1',
        slug: 'midnight-drive',
      },
    ]);
    hoisted.valuesMock.mockReturnValue({ returning: hoisted.returningMock });
    hoisted.insertMock.mockReturnValue({ values: hoisted.valuesMock });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a scheduled release with canonical reveal-date behavior', async () => {
    const { createManagedRelease } = await import(
      '@/lib/services/releases/create-release'
    );

    const result = await createManagedRelease({
      profileId: 'profile_1',
      title: '  Midnight Drive  ',
      releaseType: 'single',
      releaseDate: '2026-06-01T00:00:00.000Z',
      genres: ['Alt Pop', 'Indie', 'Electronic', 'Extra'],
      isExplicit: true,
    });

    expect(result).toMatchObject({
      id: 'release_1',
      slug: 'midnight-drive',
      title: 'Midnight Drive',
      status: 'scheduled',
    });

    expect(hoisted.valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorProfileId: 'profile_1',
        title: 'Midnight Drive',
        slug: 'midnight-drive',
        status: 'scheduled',
        sourceType: 'manual',
        totalTracks: 1,
        genres: ['Alt Pop', 'Indie', 'Electronic'],
        isExplicit: true,
      })
    );

    const inserted = hoisted.valuesMock.mock.calls[0]?.[0] as {
      revealDate: Date | null;
    };
    expect(inserted.revealDate?.toISOString()).toBe('2026-05-02T00:00:00.000Z');
  });

  it('maps duplicate-slug insert failures to a ReleaseCreationError', async () => {
    hoisted.returningMock.mockRejectedValue({ code: '23505' });

    const { createManagedRelease } = await import(
      '@/lib/services/releases/create-release'
    );

    await expect(
      createManagedRelease({
        profileId: 'profile_1',
        title: 'Midnight Drive',
        releaseType: 'single',
      })
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'Error',
        code: 'DUPLICATE_SLUG',
      })
    );
  });
});
