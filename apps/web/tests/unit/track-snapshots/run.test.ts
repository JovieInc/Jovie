import { describe, expect, it, vi } from 'vitest';
import {
  isTrackDailySnapshotsEnabled,
  parseYouTubeVideoId,
  resolveTrackSnapshotUsernames,
} from '@/lib/track-snapshots/contract';
import {
  runTrackDailySnapshots,
  type SnapshotCatalog,
  type TrackSnapshotRow,
  type TrackSnapshotStore,
} from '@/lib/track-snapshots/run';

const NOW = new Date('2026-11-02T09:25:00.000Z');
const catalog: SnapshotCatalog = {
  creatorProfileId: 'p1',
  releaseIds: ['r1', 'r2'],
  tracks: [
    { releaseId: 'r1', trackId: 't1', spotifyTrackId: 'sp1' },
    { releaseId: 'r1', trackId: 't2', spotifyTrackId: 'sp2' },
    { releaseId: 'r2', trackId: 't3', spotifyTrackId: null },
  ],
  videos: [
    { releaseId: 'r1', trackId: 't1', videoId: 'aaaaaaaaaaa' },
    { releaseId: 'r1', trackId: 't1', videoId: 'bbbbbbbbbbb' },
    { releaseId: 'r2', trackId: null, videoId: 'ccccccccccc' },
  ],
};

function makeStore() {
  const inserted: TrackSnapshotRow[] = [];
  const store: TrackSnapshotStore = {
    listProfileIds: vi.fn(async () => ['p1']),
    loadCatalog: vi.fn(async () => catalog),
    releaseClicks: vi.fn(
      async () => new Map([['r1', { total: 7, priorDay: 2 }]])
    ),
    insertMany: vi.fn(async rows => {
      inserted.push(...rows);
      return rows.length;
    }),
  };
  return { store, inserted };
}

describe('runTrackDailySnapshots', () => {
  it('writes one row per song per source with day and timestamp', async () => {
    const { store, inserted } = makeStore();
    const report = await runTrackDailySnapshots({
      now: NOW,
      usernames: ['tim'],
      store,
      fetchers: {
        spotifyPopularity: async () =>
          new Map([
            ['sp1', 24],
            ['sp2', 6],
          ]),
        youtubeViews: async () =>
          new Map([
            ['aaaaaaaaaaa', 100],
            ['bbbbbbbbbbb', 50],
            ['ccccccccccc', 9],
          ]),
      },
    });
    expect(report.failures).toEqual([]);
    expect(report.day).toBe('2026-11-02');
    expect(report.rowsInserted).toBe(report.rowsAttempted);
    expect(report.attemptedBySource).toEqual({
      spotify_popularity: 2,
      youtube_views: 2,
      jovie_release: 2,
    });
    const yt = inserted.find(
      r => r.source === 'youtube_views' && r.trackId === 't1'
    );
    expect(yt?.values.viewCount).toBe(150);
    const jovie = inserted.find(
      r => r.source === 'jovie_release' && r.releaseId === 'r1'
    );
    expect(jovie?.values).toMatchObject({
      clicksTotal: 7,
      clicksPriorDay: 2,
      priorDay: '2026-11-01',
      viewsTotal: null,
    });
    expect(inserted.every(r => r.fetchedAt === NOW)).toBe(true);
  });

  it('keeps the other sources when one source fails', async () => {
    const { store, inserted } = makeStore();
    const report = await runTrackDailySnapshots({
      now: NOW,
      usernames: ['tim'],
      store,
      fetchers: {
        spotifyPopularity: async () => {
          throw new Error('spotify_down');
        },
        youtubeViews: async () => new Map(),
      },
    });
    expect(report.failures).toEqual([
      {
        creatorProfileId: 'p1',
        source: 'spotify_popularity',
        reason: 'spotify_down',
      },
    ]);
    expect(inserted.map(r => r.source)).toEqual([
      'jovie_release',
      'jovie_release',
    ]);
  });

  it('does nothing for an empty allowlist result', async () => {
    const { store } = makeStore();
    vi.mocked(store.listProfileIds).mockResolvedValue([]);
    const report = await runTrackDailySnapshots({
      now: NOW,
      usernames: [],
      store,
      fetchers: { spotifyPopularity: vi.fn(), youtubeViews: vi.fn() },
    });
    expect(report).toMatchObject({
      profiles: 0,
      rowsInserted: 0,
      failures: [],
    });
  });
});

describe('contract helpers', () => {
  it('defaults the allowlist to tim and honours overrides', () => {
    expect(resolveTrackSnapshotUsernames(undefined)).toEqual(['tim']);
    expect(resolveTrackSnapshotUsernames(' Tim, ,Other ')).toEqual([
      'tim',
      'other',
    ]);
  });
  it('is on unless explicitly switched off', () => {
    expect(isTrackDailySnapshotsEnabled(undefined)).toBe(true);
    expect(isTrackDailySnapshotsEnabled('false')).toBe(false);
  });
  it('parses YouTube ids from the common URL shapes', () => {
    expect(
      parseYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    ).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=3')).toBe(
      'dQw4w9WgXcQ'
    );
    expect(
      parseYouTubeVideoId(
        'https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=x'
      )
    ).toBe('dQw4w9WgXcQ');
    expect(
      parseYouTubeVideoId('https://www.youtube.com/channel/UC123')
    ).toBeNull();
    expect(parseYouTubeVideoId('not a url')).toBeNull();
  });
});
