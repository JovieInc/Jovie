import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const insertMock = vi.fn();
  const selectMock = vi.fn();
  const deleteMock = vi.fn();

  return { insertMock, selectMock, deleteMock };
});

vi.mock('@/lib/db', () => ({
  db: {
    insert: hoisted.insertMock,
    select: hoisted.selectMock,
    delete: hoisted.deleteMock,
  },
  doesTableExist: vi.fn(),
}));

import {
  deleteRecordingArtists,
  upsertRecordingArtist,
} from '@/lib/discography/artist-queries/recording-artists';

describe('upsertRecordingArtist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a recording-artist relationship and returns the result', async () => {
    const expected = {
      id: 'ra-1',
      recordingId: 'rec-1',
      artistId: 'artist-1',
      role: 'main_artist',
    };

    const returning = vi.fn().mockResolvedValue([expected]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    hoisted.insertMock.mockReturnValue({ values });

    const result = await upsertRecordingArtist({
      recordingId: 'rec-1',
      artistId: 'artist-1',
      role: 'main_artist',
      isPrimary: true,
      position: 0,
    });

    expect(result).toEqual(expected);
    expect(hoisted.insertMock).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        recordingId: 'rec-1',
        artistId: 'artist-1',
        role: 'main_artist',
        isPrimary: true,
        position: 0,
      })
    );
  });

  it('defaults optional fields when omitted', async () => {
    const returning = vi.fn().mockResolvedValue([{ id: 'ra-1' }]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    hoisted.insertMock.mockReturnValue({ values });

    await upsertRecordingArtist({
      recordingId: 'rec-1',
      artistId: 'artist-1',
      role: 'main_artist',
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        creditName: null,
        joinPhrase: null,
        position: 0,
        isPrimary: false,
        sourceType: 'ingested',
      })
    );
  });
});

describe('deleteRecordingArtists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes all artist relationships for a recording', async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    hoisted.deleteMock.mockReturnValue({ where });

    await deleteRecordingArtists('rec-1');

    expect(hoisted.deleteMock).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
  });
});
