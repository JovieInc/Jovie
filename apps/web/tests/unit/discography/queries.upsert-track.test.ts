import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const insertMock = vi.fn();

  return {
    insertMock,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    insert: hoisted.insertMock,
  },
  doesTableExist: vi.fn(),
}));

import { upsertTrack } from '@/lib/discography/queries';

function createInsertChain(result: unknown[] | Error) {
  const returning =
    result instanceof Error
      ? vi.fn().mockRejectedValue(result)
      : vi.fn().mockResolvedValue(result);

  return {
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockReturnValue({
        returning,
      }),
    }),
  };
}

describe('upsertTrack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retries without ISRC when unique ISRC constraint is hit', async () => {
    const uniqueIsrcError = new Error('duplicate key value');
    Object.assign(uniqueIsrcError, {
      code: '23505',
      constraint: 'discog_tracks_isrc_unique',
    });

    const firstChain = createInsertChain(uniqueIsrcError);
    const expectedTrack = { id: 'track-1', isrc: null };
    const secondChain = createInsertChain([expectedTrack]);

    hoisted.insertMock
      .mockReturnValueOnce(firstChain)
      .mockReturnValueOnce(secondChain);

    const result = await upsertTrack({
      releaseId: 'release-1',
      creatorProfileId: 'profile-1',
      title: 'Track 1',
      slug: 'track-1',
      trackNumber: 1,
      isrc: 'US-XXX-12-00001',
    });

    expect(result).toEqual(expectedTrack);
    expect(hoisted.insertMock).toHaveBeenCalledTimes(2);

    expect(firstChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        isrc: 'US-XXX-12-00001',
      })
    );

    expect(secondChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        isrc: null,
      })
    );
  });

  it('rethrows unhandled uniqueness errors', async () => {
    const otherUniqueError = new Error('duplicate key value');
    Object.assign(otherUniqueError, {
      code: '23505',
      constraint: 'discog_tracks_release_disc_track_unique',
    });

    hoisted.insertMock.mockReturnValueOnce(createInsertChain(otherUniqueError));

    await expect(
      upsertTrack({
        releaseId: 'release-1',
        creatorProfileId: 'profile-1',
        title: 'Track 1',
        slug: 'track-1',
        trackNumber: 1,
        isrc: 'US-XXX-12-00001',
      })
    ).rejects.toBe(otherUniqueError);

    expect(hoisted.insertMock).toHaveBeenCalledTimes(1);
  });
});
