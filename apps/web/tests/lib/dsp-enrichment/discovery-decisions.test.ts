import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbOrTransaction } from '@/lib/db';
import { dspArtistMatches } from '@/lib/db/schema/dsp-enrichment';
import { processDspArtistDiscoveryJob } from '@/lib/dsp-enrichment/jobs/dsp-artist-discovery';

const mocks = vi.hoisted(() => ({
  apple: vi.fn(),
  deezer: vi.fn(),
  musicbrainz: vi.fn(),
  enqueue: vi.fn(),
  resolve: vi.fn(),
  status: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/entity/resolve', () => ({ resolveEntityIds: mocks.resolve }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/ingestion/jobs', () => ({
  enqueueDspTrackEnrichmentJob: mocks.enqueue,
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/dsp-enrichment/enrichment-status', () => ({
  setEnrichmentJobStatus: mocks.status,
}));
vi.mock('@/lib/dsp-enrichment/providers/apple-music', () => ({
  isAppleMusicAvailable: () => true,
  MAX_ISRC_BATCH_SIZE: 25,
  bulkLookupByIsrc: mocks.apple,
  getArtist: vi.fn(async () => null),
}));
vi.mock('@/lib/dsp-enrichment/providers/deezer', () => ({
  isDeezerAvailable: () => true,
  bulkLookupDeezerByIsrc: mocks.deezer,
  getDeezerArtist: vi.fn(async () => null),
}));
vi.mock('@/lib/dsp-enrichment/providers/musicbrainz', () => ({
  isMusicBrainzAvailable: () => true,
  bulkLookupMusicBrainzByIsrc: mocks.musicbrainz,
  getMusicBrainzArtist: vi.fn(async () => null),
}));

const profileId = '8473a72f-51a0-4ce0-8739-4facfd89a7a5';
const tracks = ['USAAA2600001', 'USAAA2600002', 'USAAA2600003'].map(
  (isrc, i) => ({ id: String(i), title: `Song ${i}`, isrc })
);
const providers = ['apple_music', 'deezer', 'musicbrainz'] as const;

function database(writeAccepted: boolean) {
  const values = vi.fn();
  const conflict = vi.fn();
  const update = vi.fn();
  const profile = {
    id: profileId,
    displayName: 'Luna Echo',
    spotifyFollowers: null,
    genres: [],
  };
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: async () => tracks }),
          limit: async () => [profile],
        }),
      }),
    }),
    insert: (table: unknown) => {
      expect(table).toBe(dspArtistMatches);
      return {
        values: (data: unknown) => {
          values(data);
          return {
            onConflictDoUpdate: (options: { where: SQL }) => {
              conflict(options);
              return {
                returning: async () =>
                  writeAccepted ? [{ id: 'persisted-match' }] : [],
              };
            },
          };
        },
      };
    },
    update,
  };
  return { tx: tx as unknown as DbOrTransaction, values, conflict, update };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mocks.apple.mockResolvedValue(
    new Map(
      tracks.map(t => [
        t.isrc,
        {
          id: t.id,
          attributes: { name: t.title, artistName: 'Luna Echo' },
          relationships: {
            artists: {
              data: [{ id: 'candidate-1', attributes: { name: 'Luna Echo' } }],
            },
          },
        },
      ])
    )
  );
  mocks.deezer.mockResolvedValue(
    new Map(
      tracks.map(t => [
        t.isrc,
        {
          id: t.id,
          title: t.title,
          artist: { id: 'candidate-1', name: 'Luna Echo' },
        },
      ])
    )
  );
  mocks.musicbrainz.mockResolvedValue(
    new Map(
      tracks.map(t => [
        t.isrc,
        {
          id: t.id,
          title: t.title,
          'artist-credit': [
            { artist: { id: 'candidate-1', name: 'Luna Echo' } },
          ],
        },
      ])
    )
  );
});
afterEach(() => vi.useRealTimers());

async function discover(
  provider: (typeof providers)[number],
  writeAccepted: boolean
) {
  const db = database(writeAccepted);
  const pending = processDspArtistDiscoveryJob(db.tx, {
    creatorProfileId: profileId,
    spotifyArtistId: 'spotify-source',
    targetProviders: [provider],
    dedupKey: 'synthetic-discovery',
  });
  await vi.runAllTimersAsync();
  return { ...db, result: await pending };
}

describe('DSP discovery preserves user decisions', () => {
  it.each(providers)(
    '%s uses a persistence-time guard that only replaces non-manual suggestions',
    async provider => {
      const { conflict } = await discover(provider, true);
      const query = new PgDialect().sqlToQuery(conflict.mock.calls[0][0].where);
      expect(query.sql).toBe(
        '("dsp_artist_matches"."status" = $1 and ("dsp_artist_matches"."match_source" is null or "dsp_artist_matches"."match_source" <> $2))'
      );
      expect(query.params).toEqual(['suggested', 'manual']);
    }
  );

  it.each(providers)(
    '%s does not report a new match or trigger association when the guarded upsert returns no row',
    async provider => {
      const { result, update } = await discover(provider, false);
      expect(result).toEqual({
        creatorProfileId: profileId,
        matches: [],
        errors: [],
      });
      expect(update).not.toHaveBeenCalled();
      expect(mocks.enqueue).not.toHaveBeenCalled();
      expect(mocks.resolve).not.toHaveBeenCalled();
      expect(mocks.status).toHaveBeenCalledWith(
        expect.anything(),
        profileId,
        'isrc',
        'complete'
      );
    }
  );

  it.each(providers)(
    '%s still saves a legitimate suggestion using the real catalog scorer and retains its provenance',
    async provider => {
      const { result, values, update } = await discover(provider, true);
      expect(result.matches).toEqual([
        expect.objectContaining({
          providerId: provider,
          externalArtistId: 'candidate-1',
          status: 'suggested',
        }),
      ]);
      const stored = values.mock.calls[0][0];
      expect(Number(stored.confidenceScore)).toBeCloseTo(0.725);
      expect(stored.matchingUpcCount).toBe(0);
      expect(stored).toMatchObject({
        matchSource: 'isrc_discovery',
        confirmedAt: null,
        matchingIsrcCount: 3,
      });
      expect(stored.confidenceBreakdown.meta.matchingIsrcs).toEqual(
        tracks.map(t => t.isrc)
      );
      expect(update).not.toHaveBeenCalled();
      expect(mocks.enqueue).not.toHaveBeenCalled();
    }
  );
});
