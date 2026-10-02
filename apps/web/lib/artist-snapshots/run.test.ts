import { describe, expect, it, vi } from 'vitest';
import type { ArtistDailySnapshotProvenance } from '@/lib/db/schema/artist-daily-snapshots';
import { ARTIST_SNAPSHOT_REMEDIATION_FINGERPRINT } from './contract';
import {
  type ArtistSnapshotCandidate,
  type ArtistSnapshotStore,
  runArtistDailySnapshots,
  type SnapshotFetchers,
  type StoredArtistSnapshot,
} from './run';

const provenance = (method: string): ArtistDailySnapshotProvenance => ({
  method,
  publicUrl: 'https://www.youtube.com/@artist/about',
  httpStatus: 200,
  robots: 'allowed',
  userAgent: 'jovie-link-ingestion/1.0 (+https://jov.ie)',
  access: 'logged_out',
});

function candidate(
  id: string,
  overrides: Partial<ArtistSnapshotCandidate> = {}
): ArtistSnapshotCandidate {
  return {
    creatorProfileId: id,
    youtubeUrl: 'https://www.youtube.com/@artist/about',
    instagramUrl: null,
    musicbrainzId: null,
    existingSources: [],
    ...overrides,
  };
}

function memoryStore(
  rows: readonly ArtistSnapshotCandidate[]
): ArtistSnapshotStore & { inserted: StoredArtistSnapshot[] } {
  const inserted: StoredArtistSnapshot[] = [];
  return {
    inserted,
    async listCandidates(limit) {
      return rows.slice(0, limit);
    },
    async insert(row) {
      inserted.push(row);
      return 'inserted';
    },
  };
}

function clockedSleep() {
  let time = 0;
  return {
    sleep: async (ms: number) => {
      time += ms;
    },
    clock: () => time,
  };
}

describe('runArtistDailySnapshots', () => {
  it('does no work when the flag is off', async () => {
    const youtube = vi.fn();
    const store = memoryStore([candidate('artist-1')]);
    const report = await runArtistDailySnapshots({
      enabled: false,
      now: new Date('2026-10-02T09:15:00.000Z'),
      store,
      fetchers: {
        youtube,
        instagram: vi.fn(),
        wikipedia: vi.fn(),
      },
    });

    expect(report.enabled).toBe(false);
    expect(report.inserted).toBe(0);
    expect(youtube).not.toHaveBeenCalled();
    expect(store.inserted).toHaveLength(0);
  });

  it('inserts parsed public counts and paces later fetches', async () => {
    const store = memoryStore([
      candidate('artist-1', {
        instagramUrl: 'https://www.instagram.com/artist/',
      }),
    ]);
    const { sleep, clock } = clockedSleep();
    const youtube = vi.fn(async () => ({
      kind: 'ready' as const,
      rawValues: { subscriberCount: 10, viewCount: 20, videoCount: 1 },
      provenance: provenance('youtube_data_api_v3'),
    }));
    const instagram = vi.fn(async () => ({
      kind: 'ready' as const,
      rawValues: { followerCount: 5, postCount: 2 },
      provenance: provenance('instagram_opengraph'),
    }));

    const report = await runArtistDailySnapshots({
      enabled: true,
      cap: 5,
      now: new Date('2026-10-02T09:15:00.000Z'),
      store,
      fetchers: { youtube, instagram, wikipedia: vi.fn() },
      sleep,
      clock,
    });

    expect(report.inserted).toBe(2);
    expect(store.inserted.map(row => row.source)).toEqual([
      'youtube',
      'instagram',
    ]);
    expect(store.inserted[0]?.snapshotDay).toBe('2026-10-02');
    expect(JSON.stringify(store.inserted)).not.toMatch(
      /html|cookie|access_token/i
    );
    expect(clock()).toBeGreaterThanOrEqual(1_100);
  });

  it('backs off a source after a rate limit and fingerprints once', async () => {
    const store = memoryStore([candidate('artist-1'), candidate('artist-2')]);
    const youtube = vi.fn<SnapshotFetchers['youtube']>(async () => ({
      kind: 'failure',
      reason: 'rate_limited',
      httpStatus: 429,
      backoff: true,
    }));
    const captureFailure = vi.fn(async () => undefined);

    const report = await runArtistDailySnapshots({
      enabled: true,
      now: new Date('2026-10-02T09:15:00.000Z'),
      store,
      fetchers: { youtube, instagram: vi.fn(), wikipedia: vi.fn() },
      captureFailure,
      sleep: async () => undefined,
      clock: () => 0,
    });

    expect(youtube).toHaveBeenCalledTimes(1);
    expect(store.inserted).toHaveLength(0);
    expect(report.failures).toEqual([
      {
        creatorProfileId: 'artist-1',
        source: 'youtube',
        reason: 'rate_limited',
        httpStatus: 429,
      },
    ]);
    expect(captureFailure).toHaveBeenCalledTimes(1);
    expect(captureFailure.mock.calls[0]?.[0].fingerprint).toBe(
      ARTIST_SNAPSHOT_REMEDIATION_FINGERPRINT
    );
  });

  it('does not store a row when robots disallow the page', async () => {
    const store = memoryStore([candidate('artist-1')]);
    const captureFailure = vi.fn();
    const report = await runArtistDailySnapshots({
      enabled: true,
      now: new Date('2026-10-02T09:15:00.000Z'),
      store,
      fetchers: {
        youtube: async () => ({ kind: 'skip', reason: 'robots_disallowed' }),
        instagram: vi.fn(),
        wikipedia: vi.fn(),
      },
      captureFailure,
      sleep: async () => undefined,
      clock: () => 0,
    });

    expect(report.inserted).toBe(0);
    expect(report.failures).toHaveLength(0);
    expect(captureFailure).not.toHaveBeenCalled();
  });

  it('refuses logged-in and cookie payloads', async () => {
    const store = memoryStore([candidate('artist-1')]);
    const captureFailure = vi.fn(async () => undefined);
    const loggedIn = await runArtistDailySnapshots({
      enabled: true,
      now: new Date('2026-10-02T09:15:00.000Z'),
      store,
      fetchers: {
        youtube: async () => ({
          kind: 'failure',
          reason: 'logged_in_payload',
          backoff: false,
        }),
        instagram: vi.fn(),
        wikipedia: vi.fn(),
      },
      captureFailure,
      sleep: async () => undefined,
      clock: () => 0,
    });
    expect(store.inserted).toHaveLength(0);
    expect(loggedIn.failures[0]?.reason).toBe('logged_in_payload');

    await expect(
      runArtistDailySnapshots({
        enabled: true,
        now: new Date('2026-10-02T09:15:00.000Z'),
        store: memoryStore([candidate('artist-2')]),
        fetchers: {
          youtube: async () => ({
            kind: 'ready',
            rawValues: { cookie: 'session' },
            provenance: provenance('youtube_logged_out_page'),
          }),
          instagram: vi.fn(),
          wikipedia: vi.fn(),
        },
        sleep: async () => undefined,
        clock: () => 0,
      })
    ).rejects.toThrow(/cookie/);
  });

  it('keeps the first row when the day was already stored', async () => {
    const store = memoryStore([candidate('artist-1')]);
    store.insert = async row => {
      store.inserted.push(row);
      return 'duplicate';
    };
    const report = await runArtistDailySnapshots({
      enabled: true,
      now: new Date('2026-10-02T09:15:00.000Z'),
      store,
      fetchers: {
        youtube: async () => ({
          kind: 'ready',
          rawValues: { subscriberCount: 1, viewCount: 2, videoCount: 3 },
          provenance: provenance('youtube_data_api_v3'),
        }),
        instagram: vi.fn(),
        wikipedia: vi.fn(),
      },
      sleep: async () => undefined,
      clock: () => 0,
    });
    expect(report.inserted).toBe(0);
    expect(report.failures).toHaveLength(0);
  });
});
