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

import { upsertRecording } from '@/lib/discography/queries';

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

describe('upsertRecording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retries without ISRC when unique ISRC constraint is hit', async () => {
    const uniqueIsrcError = new Error('duplicate key value');
    Object.assign(uniqueIsrcError, {
      code: '23505',
      constraint: 'discog_recordings_creator_isrc_unique',
    });

    const firstChain = createInsertChain(uniqueIsrcError);
    const expectedRecording = { id: 'recording-1', isrc: null };
    const secondChain = createInsertChain([expectedRecording]);

    hoisted.insertMock
      .mockReturnValueOnce(firstChain)
      .mockReturnValueOnce(secondChain);

    const result = await upsertRecording({
      creatorProfileId: 'profile-1',
      title: 'Recording 1',
      slug: 'recording-1',
      isrc: 'US-XXX-12-00001',
    });

    expect(result).toEqual(expectedRecording);
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
      constraint: 'discog_recordings_creator_slug_unique',
    });

    hoisted.insertMock.mockReturnValueOnce(createInsertChain(otherUniqueError));

    await expect(
      upsertRecording({
        creatorProfileId: 'profile-1',
        title: 'Recording 1',
        slug: 'recording-1',
        isrc: 'US-XXX-12-00001',
      })
    ).rejects.toBe(otherUniqueError);

    expect(hoisted.insertMock).toHaveBeenCalledTimes(1);
  });

  it('succeeds on first try when no conflict', async () => {
    const expected = { id: 'recording-1', isrc: 'USABC1234567' };
    hoisted.insertMock.mockReturnValueOnce(createInsertChain([expected]));

    const result = await upsertRecording({
      creatorProfileId: 'profile-1',
      title: 'My Song',
      slug: 'my-song',
      isrc: 'USABC1234567',
      durationMs: 210000,
      isExplicit: true,
      sourceType: 'ingested',
    });

    expect(result).toEqual(expected);
    expect(hoisted.insertMock).toHaveBeenCalledTimes(1);
  });

  it('defaults optional fields to null/false when omitted', async () => {
    const expected = { id: 'recording-1' };
    const chain = createInsertChain([expected]);
    hoisted.insertMock.mockReturnValueOnce(chain);

    await upsertRecording({
      creatorProfileId: 'profile-1',
      title: 'Minimal',
      slug: 'minimal',
    });

    expect(chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        isrc: null,
        durationMs: null,
        isExplicit: false,
        previewUrl: null,
        audioUrl: null,
        audioFormat: null,
        lyrics: null,
        sourceType: 'ingested',
      })
    );
  });
});
