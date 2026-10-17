import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbOrTransaction } from '@/lib/db';

const mocks = vi.hoisted(() => ({
  artistAlbums: vi.fn(),
  albums: vi.fn(),
  tracks: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/spotify', () => ({
  getSpotifyArtistAlbums: mocks.artistAlbums,
  getSpotifyAlbums: mocks.albums,
  getSpotifyTracks: mocks.tracks,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn() } }));

import { processCatalogScan } from '../catalog-scan';

const providerIsrc = 'USAAA2600001';
const payload = {
  creatorProfileId: '00000000-0000-4000-8000-000000000001',
  scanId: '00000000-0000-4000-8000-000000000002',
  spotifyArtistId: 'bound-artist',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.albums.mockResolvedValue([
    {
      id: 'observed-album',
      name: 'Observed Album',
      images: [],
      tracks: { items: [{ id: 'observed-track' }] },
    },
  ]);
  mocks.tracks.mockResolvedValue([
    {
      id: 'observed-track',
      name: 'Observed Track',
      artists: [{ name: 'Bound Artist' }],
      external_ids: { isrc: providerIsrc },
    },
  ]);
});

function database(localIsrc = 'USAAA2600002') {
  const updates: Array<Record<string, unknown>> = [];
  const insertedRows: Array<Record<string, unknown>> = [];
  const tx = {
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => {
        updates.push(values);
        return { where: vi.fn().mockResolvedValue(undefined) };
      }),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ isrc: localIsrc }]),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((rows: Array<Record<string, unknown>>) => {
        insertedRows.push(...rows);
        return { onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) };
      }),
    })),
  };
  return { tx, updates, insertedRows };
}

describe('catalog scan inventory admission', () => {
  it.each([
    { complete: false, total: 2, issue: 'later page unavailable' },
    { complete: false, total: 501, issue: '500 album cap' },
    { complete: true, total: 2 },
  ])(
    'fails closed for incomplete inventory %j before any findings',
    async evidence => {
      mocks.artistAlbums.mockResolvedValue({
        albums: [{ id: 'observed-album' }],
        ...evidence,
      });
      const { tx, updates, insertedRows } = database();
      const result = await processCatalogScan(
        tx as unknown as DbOrTransaction,
        payload
      );
      expect(result.status).toBe('failed');
      expect(result.error).toContain('catalog is incomplete');
      expect(result.missingCount).toBe(0);
      expect(updates.at(-1)).toMatchObject({ status: 'failed' });
      expect(mocks.albums).not.toHaveBeenCalled();
      expect(mocks.tracks).not.toHaveBeenCalled();
      expect(tx.select).not.toHaveBeenCalled();
      expect(tx.insert).not.toHaveBeenCalled();
      expect(insertedRows).toHaveLength(0);
    }
  );

  it('allows a complete matching inventory through the actual producer', async () => {
    mocks.artistAlbums.mockResolvedValue({
      albums: [{ id: 'observed-album' }],
      total: 1,
      complete: true,
    });
    const { tx, insertedRows } = database(providerIsrc);
    const result = await processCatalogScan(
      tx as unknown as DbOrTransaction,
      payload
    );
    expect(result).toMatchObject({
      status: 'completed',
      matchedCount: 1,
      missingCount: 0,
      unmatchedCount: 0,
    });
    expect(mocks.albums).toHaveBeenCalledWith(['observed-album']);
    expect(tx.select).toHaveBeenCalled();
    expect(insertedRows).toHaveLength(0);
  });
});
