import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const insertMock = vi.fn();
  const selectMock = vi.fn();

  return {
    insertMock,
    selectMock,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    insert: hoisted.insertMock,
    select: hoisted.selectMock,
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

function uniqueIsrcError() {
  return Object.assign(new Error('duplicate key value'), {
    code: '23505',
    constraint: 'discog_recordings_creator_isrc_unique',
  });
}

function createSelectChain(result: unknown[] | Error) {
  const limit =
    result instanceof Error
      ? vi.fn().mockRejectedValue(result)
      : vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  return { from, where, limit };
}

describe('upsertRecording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.insertMock.mockReset();
    hoisted.selectMock.mockReset();
  });

  it('reuses the canonical recording without losing ISRC or overwriting its facts', async () => {
    const firstChain = createInsertChain(uniqueIsrcError());
    const expectedRecording = {
      id: 'canonical-recording',
      creatorProfileId: 'profile-1',
      slug: 'canonical-slug',
      title: 'Take Me Over',
      isrc: 'QMT671400004',
      durationMs: 232066,
      lyrics: 'Existing owner-provided lyrics',
      sourceType: 'manual',
      metadata: { ownerVerified: true },
    };
    const secondChain = createInsertChain([
      { id: 'unidentifiable-duplicate', isrc: null },
    ]);
    const lookup = createSelectChain([expectedRecording]);
    hoisted.selectMock.mockReturnValue(lookup);
    hoisted.insertMock
      .mockReturnValueOnce(firstChain)
      .mockReturnValueOnce(secondChain);

    const result = await upsertRecording({
      creatorProfileId: 'profile-1',
      title: 'Take Me Over',
      slug: 'another-release-occurrence',
      isrc: 'QMT671400004',
      lyrics: null,
      metadata: { spotifyId: 'another-occurrence' },
    });

    expect(result).toEqual(expectedRecording);
    expect(hoisted.insertMock).toHaveBeenCalledTimes(1);
    expect(firstChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ isrc: 'QMT671400004' })
    );
    expect(secondChain.values).not.toHaveBeenCalled();
    const query = new PgDialect().sqlToQuery(lookup.where.mock.calls[0][0]);
    expect(query.params).toEqual(['profile-1', 'QMT671400004']);
    expect(query.sql).toContain('"creator_profile_id"');
    expect(query.sql).toContain('"isrc"');
    expect(lookup.limit).toHaveBeenCalledWith(1);
  });

  it('fails without another insert when the canonical collision row is unavailable', async () => {
    const error = uniqueIsrcError();
    hoisted.insertMock
      .mockReturnValueOnce(createInsertChain(error))
      .mockReturnValueOnce(
        createInsertChain([{ id: 'duplicate', isrc: null }])
      );
    hoisted.selectMock.mockReturnValue(createSelectChain([]));

    await expect(
      upsertRecording({
        creatorProfileId: 'profile-1',
        title: 'Take Me Over',
        slug: 'another-occurrence',
        isrc: 'QMT671400004',
      })
    ).rejects.toBe(error);
    expect(hoisted.insertMock).toHaveBeenCalledTimes(1);
  });

  it('propagates a failed canonical lookup instead of deleting the identifier', async () => {
    const lookupError = new Error('database unavailable');
    hoisted.insertMock
      .mockReturnValueOnce(createInsertChain(uniqueIsrcError()))
      .mockReturnValueOnce(
        createInsertChain([{ id: 'duplicate', isrc: null }])
      );
    hoisted.selectMock.mockReturnValue(createSelectChain(lookupError));

    await expect(
      upsertRecording({
        creatorProfileId: 'profile-1',
        title: 'Take Me Over',
        slug: 'another-occurrence',
        isrc: 'QMT671400004',
      })
    ).rejects.toBe(lookupError);
    expect(hoisted.insertMock).toHaveBeenCalledTimes(1);
  });

  it('does not attempt canonical reuse for an unexpected collision without an ISRC', async () => {
    const error = uniqueIsrcError();
    hoisted.insertMock
      .mockReturnValueOnce(createInsertChain(error))
      .mockReturnValueOnce(
        createInsertChain([{ id: 'duplicate', isrc: null }])
      );

    await expect(
      upsertRecording({
        creatorProfileId: 'profile-1',
        title: 'Unidentified recording',
        slug: 'unidentified-recording',
      })
    ).rejects.toBe(error);
    expect(hoisted.insertMock).toHaveBeenCalledTimes(1);
    expect(hoisted.selectMock).not.toHaveBeenCalled();
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
