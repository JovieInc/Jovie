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
  robots: 'not_applicable',
  userAgent: 'youtube-data-api-v3',
  access: 'logged_out',
});
function candidate(
  id: string,
  instagramUrl: string | null = null
): ArtistSnapshotCandidate {
  return {
    creatorProfileId: id,
    youtubeUrl: 'https://www.youtube.com/@artist/about',
    instagramUrl,
    musicbrainzId: null,
    existingSources: [],
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
const now = new Date('2026-10-02T09:15:00.000Z');
function run(
  store: ArtistSnapshotStore,
  fetchers: SnapshotFetchers,
  extra: Partial<Parameters<typeof runArtistDailySnapshots>[0]> = {}
) {
  return runArtistDailySnapshots({
    enabled: true,
    now,
    store,
    fetchers,
    sleep: async () => undefined,
    clock: () => 0,
    ...extra,
  });
}
describe('runArtistDailySnapshots', () => {
  it('does no work when the flag is off', async () => {
    const youtube = vi.fn();
    const store = memoryStore([candidate('artist-1')]);
    const report = await run(
      store,
      { youtube, instagram: vi.fn(), wikipedia: vi.fn() },
      { enabled: false }
    );
    expect(report).toMatchObject({ enabled: false, inserted: 0 });
    expect(youtube).not.toHaveBeenCalled();
  });
  it('stores an exact row and paces the next fetch', async () => {
    const store = memoryStore([
      candidate('artist-1', 'https://www.instagram.com/artist/'),
    ]);
    let time = 0;
    const report = await run(
      store,
      {
        youtube: async () => ({
          kind: 'ready',
          rawValues: {
            precision: 'exact',
            subscriberCount: 29200,
            videoCount: 532,
          },
          provenance: provenance('youtube_data_api_v3'),
        }),
        instagram: async () => ({
          kind: 'skip',
          reason: 'needs_isolated_egress',
        }),
        wikipedia: vi.fn(),
      },
      {
        sleep: async ms => {
          time += ms;
        },
        clock: () => time,
      }
    );
    expect(report.inserted).toBe(1);
    expect(store.inserted[0]?.rawValues.precision).toBe('exact');
    expect(store.inserted[0]?.snapshotDay).toBe('2026-10-02');
    expect(time).toBeGreaterThanOrEqual(1_100);
  });
  it('backs off once and fingerprints the run', async () => {
    const youtube = vi.fn(async () => ({
      kind: 'failure' as const,
      reason: 'rate_limited',
      httpStatus: 429,
      backoff: true,
    }));
    const captureFailure = vi.fn(async () => undefined);
    const report = await run(
      memoryStore([candidate('a'), candidate('b')]),
      { youtube, instagram: vi.fn(), wikipedia: vi.fn() },
      { captureFailure }
    );
    expect(youtube).toHaveBeenCalledTimes(1);
    expect(report.failures[0]?.reason).toBe('rate_limited');
    expect(captureFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        fingerprint: ARTIST_SNAPSHOT_REMEDIATION_FINGERPRINT,
      })
    );
  });
  it('does not store skips, cookies, or counts without precision', async () => {
    const skipped = memoryStore([candidate('a')]);
    const captureFailure = vi.fn();
    await run(
      skipped,
      {
        youtube: async () => ({
          kind: 'skip',
          reason: 'youtube_data_api_key_unset',
        }),
        instagram: vi.fn(),
        wikipedia: vi.fn(),
      },
      { captureFailure }
    );
    expect(skipped.inserted).toHaveLength(0);
    expect(captureFailure).not.toHaveBeenCalled();
    const poisoned = memoryStore([candidate('b')]);
    const rejected = await run(poisoned, {
      youtube: async () => ({
        kind: 'ready',
        rawValues: { cookie: 'session', precision: 'exact' },
        provenance: provenance('youtube_data_api_v3'),
      }),
      instagram: vi.fn(),
      wikipedia: vi.fn(),
    });
    expect(poisoned.inserted).toHaveLength(0);
    expect(rejected.failures[0]?.reason).toMatch(/cookie/);
    const unprecise = memoryStore([candidate('c')]);
    const missing = await run(unprecise, {
      youtube: async () => ({
        kind: 'ready',
        rawValues: { subscriberCount: 4120 },
        provenance: provenance('youtube_data_api_v3'),
      }),
      instagram: vi.fn(),
      wikipedia: vi.fn(),
    });
    expect(unprecise.inserted).toHaveLength(0);
    expect(missing.failures[0]?.reason).toBe('missing_precision');
  });
});
