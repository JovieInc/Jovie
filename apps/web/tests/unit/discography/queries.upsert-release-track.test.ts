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

import { upsertReleaseTrack } from '@/lib/discography/queries';

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

describe('upsertReleaseTrack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retries with fallback slug when slug collision occurs', async () => {
    const slugCollisionError = new Error('duplicate key value');
    Object.assign(slugCollisionError, {
      code: '23505',
      constraint: 'discog_release_tracks_release_slug_unique',
    });

    const firstChain = createInsertChain(slugCollisionError);
    const expected = { id: 'rt-1', slug: 'my-track-1-1' };
    const secondChain = createInsertChain([expected]);

    hoisted.insertMock
      .mockReturnValueOnce(firstChain)
      .mockReturnValueOnce(secondChain);

    const result = await upsertReleaseTrack({
      releaseId: 'release-1',
      recordingId: 'recording-1',
      title: 'My Track',
      slug: 'my-track',
      trackNumber: 1,
      discNumber: 1,
    });

    expect(result).toEqual(expected);
    expect(hoisted.insertMock).toHaveBeenCalledTimes(2);

    // First attempt uses original slug
    expect(firstChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'my-track' })
    );

    // Second attempt uses fallback slug: `${slug}-${discNumber}-${trackNumber}`
    expect(secondChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'my-track-1-1' })
    );
  });

  it('rethrows unhandled uniqueness errors', async () => {
    const positionError = new Error('duplicate key value');
    Object.assign(positionError, {
      code: '23505',
      constraint: 'discog_release_tracks_position_unique',
    });

    hoisted.insertMock.mockReturnValueOnce(createInsertChain(positionError));

    await expect(
      upsertReleaseTrack({
        releaseId: 'release-1',
        recordingId: 'recording-1',
        title: 'Track 1',
        slug: 'track-1',
        trackNumber: 1,
      })
    ).rejects.toBe(positionError);

    expect(hoisted.insertMock).toHaveBeenCalledTimes(1);
  });

  it('succeeds on first try when no conflict', async () => {
    const expected = { id: 'rt-1', slug: 'my-track' };
    hoisted.insertMock.mockReturnValueOnce(createInsertChain([expected]));

    const result = await upsertReleaseTrack({
      releaseId: 'release-1',
      recordingId: 'recording-1',
      title: 'My Track',
      slug: 'my-track',
      trackNumber: 3,
      discNumber: 2,
    });

    expect(result).toEqual(expected);
    expect(hoisted.insertMock).toHaveBeenCalledTimes(1);
  });

  it('defaults discNumber to 1 when omitted', async () => {
    const chain = createInsertChain([{ id: 'rt-1' }]);
    hoisted.insertMock.mockReturnValueOnce(chain);

    await upsertReleaseTrack({
      releaseId: 'release-1',
      recordingId: 'recording-1',
      title: 'Track',
      slug: 'track',
      trackNumber: 1,
    });

    expect(chain.values).toHaveBeenCalledWith(
      expect.objectContaining({ discNumber: 1 })
    );
  });
});
