/**
 * Unit tests for the YouTube library sync engine (JOV-5136)
 *
 * Runs without a DB: `syncChannelVideos` is exercised through a fake
 * provider plus an in-memory `YouTubeLibraryRepository` that mirrors the
 * Drizzle upsert semantics (mutable fields overwritten; classification
 * adopted only while classification_rationale IS NULL).
 */

import { describe, expect, it, vi } from 'vitest';
import type {
  NewYoutubeVideoMetricSnapshot,
  NewYoutubeVideoReleaseLink,
  YoutubeThumbnailVersion,
  YoutubeVideo,
} from '@/lib/db/schema/youtube-library';
import type { CatalogRecording } from '@/lib/youtube-library/isrc';
import type { YouTubeLibraryRepository } from '@/lib/youtube-library/repository';
import type {
  YouTubeChannelVideo,
  YouTubeLibraryProvider,
  YouTubeVideoMetrics,
} from '@/lib/youtube-library/types';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  bestThumbnailUrl,
  buildVideoUpsertRow,
  planThumbnailSync,
  runScheduledRefreshes,
  syncChannelVideos,
} from '@/lib/youtube-library/sync';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const CHANNEL_ID = 'UC-channel-1';
const NOW = new Date('2026-08-14T00:00:00.000Z');

function makeVideo(
  overrides: Partial<YouTubeChannelVideo> = {}
): YouTubeChannelVideo {
  return {
    channelId: CHANNEL_ID,
    videoId: 'yt-1',
    title: 'Neon Skyline (Official Music Video)',
    description: 'Provided to YouTube by DistroKid\nISRC USABC2600001',
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    durationSeconds: 200,
    url: 'https://youtube.com/watch?v=yt-1',
    privacyStatus: 'public',
    thumbnails: { high: { url: 'https://i.ytimg.com/vi/yt-1/hqdefault.jpg' } },
    ...overrides,
  };
}

function makeMetric(
  overrides: Partial<YouTubeVideoMetrics> = {}
): YouTubeVideoMetrics {
  return {
    videoId: 'yt-1',
    window: 'day_7',
    windowStart: new Date('2026-08-01T00:00:00.000Z'),
    windowEnd: new Date('2026-08-07T00:00:00.000Z'),
    impressions: 100,
    ctr: 0.05,
    views: 40,
    watchTimeMinutes: 120,
    watchTimePerImpression: 1.2,
    avgViewDurationSeconds: 180,
    trafficSources: { YT_SEARCH: 25 },
    ...overrides,
  };
}

function makeProvider(
  videos: YouTubeChannelVideo[],
  metrics: YouTubeVideoMetrics[] = []
): YouTubeLibraryProvider {
  return {
    listChannelVideos: vi.fn(async () => videos),
    fetchVideoMetrics: vi.fn(async () => metrics),
  };
}

// ---------------------------------------------------------------------------
// In-memory repository (mirrors the Drizzle upsert semantics)
// ---------------------------------------------------------------------------

function snapshotKey(row: {
  videoId: string;
  window: string;
  windowStart: Date;
  windowEnd: Date;
}): string {
  return [
    row.videoId,
    row.window,
    row.windowStart.toISOString(),
    row.windowEnd.toISOString(),
  ].join('|');
}

function createInMemoryRepo() {
  let pkCounter = 0;
  const videosByKey = new Map<string, YoutubeVideo>();
  const thumbnailVersions: YoutubeThumbnailVersion[] = [];
  const snapshots = new Map<string, NewYoutubeVideoMetricSnapshot>();
  const links: NewYoutubeVideoReleaseLink[] = [];
  let catalog: CatalogRecording[] = [];

  const repo: YouTubeLibraryRepository = {
    async listExistingVideos(creatorProfileId, channelId) {
      return [...videosByKey.values()].filter(
        v =>
          v.creatorProfileId === creatorProfileId && v.channelId === channelId
      );
    },

    async upsertVideos(rows) {
      const map = new Map<string, string>();
      for (const row of rows) {
        const key = `${row.channelId}|${row.videoId}`;
        const existing = videosByKey.get(key);
        if (existing) {
          // Mirror the SQL: classification fields only when still unclassified.
          const unclassified = existing.classificationRationale === null;
          videosByKey.set(key, {
            ...existing,
            title: row.title ?? existing.title,
            description:
              row.description === undefined
                ? existing.description
                : row.description,
            durationSeconds:
              row.durationSeconds === undefined
                ? existing.durationSeconds
                : row.durationSeconds,
            privacyStatus:
              row.privacyStatus === undefined
                ? existing.privacyStatus
                : row.privacyStatus,
            currentThumbnails:
              row.currentThumbnails ?? existing.currentThumbnails,
            lastSyncedAt: row.lastSyncedAt ?? existing.lastSyncedAt,
            updatedAt: row.updatedAt ?? existing.updatedAt,
            contentType: unclassified
              ? (row.contentType ?? existing.contentType)
              : existing.contentType,
            classificationRationale: unclassified
              ? (row.classificationRationale ?? null)
              : existing.classificationRationale,
            classificationConfidence: unclassified
              ? (row.classificationConfidence ?? null)
              : existing.classificationConfidence,
          });
          map.set(row.videoId as string, existing.id);
        } else {
          const id = `pk-${++pkCounter}`;
          videosByKey.set(key, {
            id,
            creatorProfileId: row.creatorProfileId as string,
            channelId: row.channelId as string,
            videoId: row.videoId as string,
            title: row.title as string,
            description: row.description ?? null,
            publishedAt: row.publishedAt ?? null,
            durationSeconds: row.durationSeconds ?? null,
            url: row.url as string,
            privacyStatus: row.privacyStatus ?? null,
            contentType: row.contentType ?? 'other',
            classificationRationale: row.classificationRationale ?? null,
            classificationConfidence: row.classificationConfidence ?? null,
            currentThumbnails: row.currentThumbnails ?? {},
            lastSyncedAt: row.lastSyncedAt ?? null,
            createdAt: NOW,
            updatedAt: NOW,
          });
          map.set(row.videoId as string, id);
        }
      }
      return map;
    },

    async insertThumbnailVersions(rows) {
      for (const row of rows) {
        thumbnailVersions.push({
          id: `tv-${thumbnailVersions.length + 1}`,
          videoId: row.videoId,
          kind: row.kind,
          imageUrl: row.imageUrl,
          provenance: row.provenance,
          approvalStatus: row.approvalStatus ?? 'not_required',
          approvedBy: row.approvedBy ?? null,
          approvedAt: row.approvedAt ?? null,
          swappedAt: row.swappedAt ?? null,
          rollbackTargetId: row.rollbackTargetId ?? null,
          experimentId: row.experimentId ?? null,
          cohortId: row.cohortId ?? null,
          detectedAt: row.detectedAt ?? NOW,
        });
      }
    },

    async relabelThumbnailVersions(ids, kind) {
      for (const version of thumbnailVersions) {
        if (ids.includes(version.id)) version.kind = kind;
      }
    },

    async listThumbnailVersions(videoPks) {
      return thumbnailVersions.filter(v => videoPks.includes(v.videoId));
    },

    async upsertMetricSnapshots(rows) {
      for (const row of rows) {
        snapshots.set(snapshotKey(row), row);
      }
    },

    async listLinkedVideoIds(videoPks) {
      return links
        .filter(l => videoPks.includes(l.videoId))
        .map(l => l.videoId);
    },

    async listCatalogRecordings() {
      return catalog;
    },

    async insertReleaseLinks(rows) {
      links.push(...rows);
    },

    async listStaleChannels(cutoff) {
      const seen = new Map<
        string,
        { creatorProfileId: string; channelId: string }
      >();
      for (const v of videosByKey.values()) {
        const stale = !v.lastSyncedAt || v.lastSyncedAt < cutoff;
        if (stale) {
          seen.set(`${v.creatorProfileId}|${v.channelId}`, {
            creatorProfileId: v.creatorProfileId,
            channelId: v.channelId,
          });
        }
      }
      return [...seen.values()];
    },
  };

  return {
    repo,
    videosByKey,
    thumbnailVersions,
    snapshots,
    links,
    setCatalog(next: CatalogRecording[]) {
      catalog = next;
    },
  };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('bestThumbnailUrl', () => {
  it('prefers higher resolutions', () => {
    expect(
      bestThumbnailUrl({
        default: { url: 'd' },
        medium: { url: 'm' },
        high: { url: 'h' },
        maxres: { url: 'x' },
      })
    ).toBe('x');
    expect(
      bestThumbnailUrl({ default: { url: 'd' }, medium: { url: 'm' } })
    ).toBe('m');
    expect(bestThumbnailUrl({})).toBeNull();
    expect(bestThumbnailUrl(null)).toBeNull();
  });
});

describe('buildVideoUpsertRow', () => {
  it('classifies and formats the confidence as decimal string', () => {
    const row = buildVideoUpsertRow(makeVideo(), PROFILE_ID, NOW);
    expect(row.contentType).toBe('music_video');
    // distributor block + music-video title combine to 0.9
    expect(row.classificationConfidence).toBe('0.9000');
    expect(row.classificationRationale).toContain('music_video');
    expect(row.lastSyncedAt).toBe(NOW);
  });
});

describe('planThumbnailSync', () => {
  it('appends an original row for new videos', () => {
    const plan = planThumbnailSync({
      videoPk: 'pk-1',
      thumbnails: { high: { url: 'https://img/h.jpg' } },
      versions: [],
      isNew: true,
      now: NOW,
    });
    expect(plan.relabelToPreviousIds).toEqual([]);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0].kind).toBe('original');
    expect(plan.inserts[0].approvalStatus).toBe('not_required');
    expect(plan.inserts[0].provenance).toEqual({ source: 'youtube' });
  });

  it('relabels the effective version and appends current on change', () => {
    const existing = [
      {
        id: 'tv-1',
        videoId: 'pk-1',
        kind: 'original',
        imageUrl: 'https://img/old.jpg',
        provenance: { source: 'youtube' },
        approvalStatus: 'not_required',
        approvedBy: null,
        approvedAt: null,
        swappedAt: null,
        rollbackTargetId: null,
        experimentId: null,
        cohortId: null,
        detectedAt: new Date('2026-08-01T00:00:00.000Z'),
      } satisfies YoutubeThumbnailVersion,
    ];
    const plan = planThumbnailSync({
      videoPk: 'pk-1',
      thumbnails: { high: { url: 'https://img/new.jpg' } },
      versions: existing,
      isNew: false,
      now: NOW,
    });
    expect(plan.relabelToPreviousIds).toEqual(['tv-1']);
    expect(plan.inserts[0].kind).toBe('current');
    expect(plan.inserts[0].imageUrl).toBe('https://img/new.jpg');
  });

  it('does nothing when the best thumbnail is unchanged', () => {
    const existing = [
      {
        id: 'tv-1',
        videoId: 'pk-1',
        kind: 'current',
        imageUrl: 'https://img/same.jpg',
        provenance: { source: 'youtube' },
        approvalStatus: 'not_required',
        approvedBy: null,
        approvedAt: null,
        swappedAt: null,
        rollbackTargetId: null,
        experimentId: null,
        cohortId: null,
        detectedAt: NOW,
      } satisfies YoutubeThumbnailVersion,
    ];
    const plan = planThumbnailSync({
      videoPk: 'pk-1',
      thumbnails: { maxres: { url: 'https://img/same.jpg' } },
      versions: existing,
      isNew: false,
      now: NOW,
    });
    expect(plan.inserts).toEqual([]);
    expect(plan.relabelToPreviousIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// syncChannelVideos
// ---------------------------------------------------------------------------

describe('syncChannelVideos', () => {
  it('is idempotent: syncing twice creates no duplicate videos', async () => {
    const { repo, videosByKey } = createInMemoryRepo();
    const videos = [
      makeVideo(),
      makeVideo({ videoId: 'yt-2', title: 'Tour Vlog', durationSeconds: 600 }),
    ];
    const provider = makeProvider(videos);

    const first = await syncChannelVideos({
      creatorProfileId: PROFILE_ID,
      channelId: CHANNEL_ID,
      provider,
      windows: [],
      now: NOW,
      repo,
    });
    expect(first.inserted).toBe(2);
    expect(first.updated).toBe(0);
    expect(videosByKey.size).toBe(2);

    const second = await syncChannelVideos({
      creatorProfileId: PROFILE_ID,
      channelId: CHANNEL_ID,
      provider,
      windows: [],
      now: new Date('2026-08-15T00:00:00.000Z'),
      repo,
    });
    expect(second.inserted).toBe(0);
    expect(second.updated).toBe(2);
    expect(videosByKey.size).toBe(2);
  });

  it('snapshot upsert refreshes the same window+range in place and appends new ranges', async () => {
    const { repo, snapshots } = createInMemoryRepo();
    const video = makeVideo();

    await syncChannelVideos({
      creatorProfileId: PROFILE_ID,
      channelId: CHANNEL_ID,
      provider: makeProvider([video], [makeMetric()]),
      windows: ['day_7'],
      now: NOW,
      repo,
    });
    expect(snapshots.size).toBe(1);

    // Same window + range, new measurements -> update in place.
    await syncChannelVideos({
      creatorProfileId: PROFILE_ID,
      channelId: CHANNEL_ID,
      provider: makeProvider([video], [makeMetric({ views: 55 })]),
      windows: ['day_7'],
      now: new Date('2026-08-14T01:00:00.000Z'),
      repo,
    });
    expect(snapshots.size).toBe(1);
    expect([...snapshots.values()][0].views).toBe(55);

    // Different range -> history row appended.
    await syncChannelVideos({
      creatorProfileId: PROFILE_ID,
      channelId: CHANNEL_ID,
      provider: makeProvider(
        [video],
        [
          makeMetric({
            windowStart: new Date('2026-08-08T00:00:00.000Z'),
            windowEnd: new Date('2026-08-14T00:00:00.000Z'),
          }),
        ]
      ),
      windows: ['day_7'],
      now: new Date('2026-08-14T02:00:00.000Z'),
      repo,
    });
    expect(snapshots.size).toBe(2);
  });

  it('thumbnail changes append a current version and relabel the previous; original is preserved', async () => {
    const { repo, thumbnailVersions } = createInMemoryRepo();
    const video = makeVideo();

    await syncChannelVideos({
      creatorProfileId: PROFILE_ID,
      channelId: CHANNEL_ID,
      provider: makeProvider([video]),
      windows: [],
      now: NOW,
      repo,
    });
    expect(thumbnailVersions).toHaveLength(1);
    expect(thumbnailVersions[0].kind).toBe('original');
    const originalUrl = thumbnailVersions[0].imageUrl;

    // Second sync with an updated thumbnail set.
    const changed = makeVideo({
      thumbnails: {
        maxres: { url: 'https://i.ytimg.com/vi/yt-1/maxres-NEW.jpg' },
      },
    });
    const result = await syncChannelVideos({
      creatorProfileId: PROFILE_ID,
      channelId: CHANNEL_ID,
      provider: makeProvider([changed]),
      windows: [],
      now: new Date('2026-08-15T00:00:00.000Z'),
      repo,
    });

    expect(result.thumbnailsChanged).toBe(1);
    expect(thumbnailVersions).toHaveLength(2);
    const original = thumbnailVersions.find(v => v.id === 'tv-1');
    const current = thumbnailVersions.find(v => v.kind === 'current');
    expect(original?.kind).toBe('previous');
    // Immutability: imageUrl and provenance of the original row are untouched.
    expect(original?.imageUrl).toBe(originalUrl);
    expect(original?.provenance).toEqual({ source: 'youtube' });
    expect(current?.imageUrl).toBe(
      'https://i.ytimg.com/vi/yt-1/maxres-NEW.jpg'
    );

    // Third sync, no change -> no additional rows.
    await syncChannelVideos({
      creatorProfileId: PROFILE_ID,
      channelId: CHANNEL_ID,
      provider: makeProvider([changed]),
      windows: [],
      now: new Date('2026-08-16T00:00:00.000Z'),
      repo,
    });
    expect(thumbnailVersions).toHaveLength(2);
  });

  it('creates ISRC links only for music videos with a description ISRC', async () => {
    const { repo, links, setCatalog } = createInMemoryRepo();
    setCatalog([
      {
        id: 'rec-1',
        isrc: 'USABC2600001',
        releaseId: 'rel-1',
        title: 'Neon Skyline',
      },
    ]);

    const musicVideo = makeVideo(); // description carries USABC2600001
    const shortWithIsrc = makeVideo({
      videoId: 'yt-2',
      title: 'Teaser #shorts',
      description: 'ISRC USABC2600001',
      durationSeconds: 30,
    });
    const titleOnlyIsrc = makeVideo({
      videoId: 'yt-3',
      title: 'Midnight Run (Official Music Video)', // no ISRC in description
      description: 'Check out the new track!',
      durationSeconds: 210,
    });

    const result = await syncChannelVideos({
      creatorProfileId: PROFILE_ID,
      channelId: CHANNEL_ID,
      provider: makeProvider([musicVideo, shortWithIsrc, titleOnlyIsrc]),
      windows: [],
      now: NOW,
      repo,
    });

    expect(result.linksCreated).toBe(1);
    expect(links).toHaveLength(1);
    expect(links[0].status).toBe('approved');
    expect(links[0].matchSource).toBe('distributor_data');
    expect(links[0].confidence).toBe('0.9500');
    expect(links[0].recordingId).toBe('rec-1');
    expect(links[0].releaseId).toBe('rel-1');
    expect(links[0].isrc).toBe('USABC2600001');

    // Second sync must not duplicate the link.
    const second = await syncChannelVideos({
      creatorProfileId: PROFILE_ID,
      channelId: CHANNEL_ID,
      provider: makeProvider([musicVideo, shortWithIsrc, titleOnlyIsrc]),
      windows: [],
      now: new Date('2026-08-15T00:00:00.000Z'),
      repo,
    });
    expect(second.linksCreated).toBe(0);
    expect(links).toHaveLength(1);
  });

  it('does not overwrite an existing classification on re-sync', async () => {
    const { repo, videosByKey } = createInMemoryRepo();
    const video = makeVideo(); // classified music_video on insert

    await syncChannelVideos({
      creatorProfileId: PROFILE_ID,
      channelId: CHANNEL_ID,
      provider: makeProvider([video]),
      windows: [],
      now: NOW,
      repo,
    });

    // Provider now reports a title that would classify differently.
    const retitled = makeVideo({ title: 'Studio Vlog ep. 9' });
    await syncChannelVideos({
      creatorProfileId: PROFILE_ID,
      channelId: CHANNEL_ID,
      provider: makeProvider([retitled]),
      windows: [],
      now: new Date('2026-08-15T00:00:00.000Z'),
      repo,
    });

    const stored = videosByKey.get(`${CHANNEL_ID}|yt-1`);
    expect(stored?.title).toBe('Studio Vlog ep. 9'); // mutable field updated
    expect(stored?.contentType).toBe('music_video'); // classification kept
  });
});

// ---------------------------------------------------------------------------
// runScheduledRefreshes
// ---------------------------------------------------------------------------

describe('runScheduledRefreshes', () => {
  it('is a no-op when no provider is wired (JOV-3189 seam)', async () => {
    const { repo } = createInMemoryRepo();
    const result = await runScheduledRefreshes({ provider: null, repo });
    expect(result).toEqual({ skipped: true, reason: 'no-provider' });
  });

  it('re-syncs only channels stale for more than 24h', async () => {
    const { repo, videosByKey } = createInMemoryRepo();
    const video = makeVideo();
    const provider = makeProvider([video]);

    // First sync establishes the channel with lastSyncedAt = NOW.
    await syncChannelVideos({
      creatorProfileId: PROFILE_ID,
      channelId: CHANNEL_ID,
      provider,
      windows: [],
      now: NOW,
      repo,
    });

    // 12h later: fresh -> skipped.
    const fresh = await runScheduledRefreshes({
      provider,
      now: new Date(NOW.getTime() + 12 * 60 * 60 * 1000),
      repo,
    });
    expect(fresh).toEqual({ skipped: false, synced: 0, failed: 0 });

    // 25h later: stale -> re-synced.
    const stale = await runScheduledRefreshes({
      provider,
      now: new Date(NOW.getTime() + 25 * 60 * 60 * 1000),
      repo,
    });
    expect(stale).toEqual({ skipped: false, synced: 1, failed: 0 });
    expect(videosByKey.get(`${CHANNEL_ID}|yt-1`)?.lastSyncedAt).toEqual(
      new Date(NOW.getTime() + 25 * 60 * 60 * 1000)
    );
  });
});
