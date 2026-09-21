import { describe, expect, it, vi } from 'vitest';
import { YouTubeProviderError } from '@/lib/connectors/youtube/provider';
import {
  importYouTubeChannelPage,
  loadYouTubeImportSnapshot,
  type YouTubeImportStore,
} from '@/lib/youtube-library/import-channel';
import {
  emptyYouTubeImportCounts,
  resolveYouTubeImportSurface,
  type YouTubeImportCursor,
} from '@/lib/youtube-library/import-status';
import type {
  YouTubeChannelVideo,
  YouTubeChannelVideosPage,
  YouTubeLibraryProvider,
} from '@/lib/youtube-library/types';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const CHANNEL_ID = 'UC-owned';
const NOW = new Date('2026-09-16T12:00:00.000Z');

function video(
  overrides: Partial<YouTubeChannelVideo> = {}
): YouTubeChannelVideo {
  return {
    channelId: CHANNEL_ID,
    videoId: 'yt-1',
    title: 'Neon Skyline',
    description: null,
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    durationSeconds: 200,
    url: 'https://youtube.com/watch?v=yt-1',
    privacyStatus: 'public',
    thumbnails: {},
    ...overrides,
  };
}

function account() {
  return {
    id: 'account-1',
    status: 'connected' as const,
    channelId: CHANNEL_ID,
    scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
    lastSyncAt: null,
    lastErrorCode: null,
    lastErrorUserMessage: null,
    providerTitle: 'Artist Channel',
  };
}

function page(
  videos: YouTubeChannelVideo[],
  nextPageToken: string | null,
  skipped: YouTubeChannelVideosPage['skipped'] = []
): YouTubeChannelVideosPage {
  return {
    channelId: CHANNEL_ID,
    channelTitle: 'Artist Channel',
    uploadsPlaylistId: 'UU-owned',
    videos,
    nextPageToken,
    skipped,
  };
}

function cursor(
  overrides: Partial<YouTubeImportCursor> = {}
): YouTubeImportCursor {
  return {
    version: 1,
    channelId: CHANNEL_ID,
    uploadsPlaylistId: 'UU-owned',
    pageToken: null,
    complete: false,
    counts: emptyYouTubeImportCounts(),
    reasons: [],
    lastSuccessfulObservationAt: null,
    providerAccountId: CHANNEL_ID,
    providerTitle: 'Artist Channel',
    lastErrorCode: null,
    ...overrides,
  };
}

function createStore(
  overrides: {
    readonly accounts?: ReturnType<typeof account>[];
    readonly cursor?: unknown;
  } = {}
) {
  const saved: unknown[] = [];
  const store: YouTubeImportStore = {
    loadAccounts: vi.fn(async () => overrides.accounts ?? []),
    loadCursor: vi.fn(async () => overrides.cursor ?? null),
    saveCursor: vi.fn(async (_id, next) => {
      saved.push(next);
    }),
    markAccount: vi.fn(async () => undefined),
  };
  return { store, saved };
}

function provider(
  listPage: YouTubeLibraryProvider['listChannelVideosPage']
): YouTubeLibraryProvider {
  return {
    listChannelVideos: vi.fn(),
    listChannelVideosPage: listPage,
    fetchVideoMetrics: vi.fn(async () => []),
  };
}

async function importPage(
  store: YouTubeImportStore,
  nextProvider: YouTubeLibraryProvider,
  syncVideos = vi.fn(async (input: { incoming?: readonly unknown[] }) => ({
    creatorProfileId: PROFILE_ID,
    channelId: CHANNEL_ID,
    total: input.incoming?.length ?? 0,
    inserted: input.incoming?.length ?? 0,
    updated: 0,
    snapshotsUpserted: 0,
    thumbnailsChanged: 0,
    linksCreated: 0,
  }))
) {
  return importYouTubeChannelPage({
    userId: 'user-1',
    creatorProfileId: PROFILE_ID,
    provider: nextProvider,
    store,
    now: NOW,
    syncVideos,
  });
}

describe('YouTube channel import', () => {
  it('distinguishes empty, expired, quota, and populated surfaces', () => {
    const base = {
      channelId: CHANNEL_ID,
      lastSyncAt: null as Date | null,
      lastErrorCode: null as string | null,
      lastErrorUserMessage: null as string | null,
      providerTitle: 'Artist Channel',
    };
    expect(resolveYouTubeImportSurface({ accounts: [] }).state).toBe(
      'disconnected'
    );
    expect(
      resolveYouTubeImportSurface({
        accounts: [{ ...base, status: 'needs_reauth' }],
      }).state
    ).toBe('authorization-expired');
    expect(
      resolveYouTubeImportSurface({
        accounts: [
          {
            ...base,
            status: 'connected',
            lastErrorCode: 'youtube_quota_limited',
          },
        ],
        cursor: cursor({ pageToken: 'page-3' }),
      })
    ).toMatchObject({ state: 'quota-limited', resumable: true });
    expect(
      resolveYouTubeImportSurface({
        accounts: [{ ...base, status: 'connected' }],
        cursor: cursor({ complete: true }),
        localVideoCount: 2,
      }).state
    ).toBe('populated');
    expect(
      resolveYouTubeImportSurface({
        accounts: [
          {
            ...base,
            status: 'connected',
            lastErrorCode: 'youtube_sync_failed',
            lastErrorUserMessage: 'YouTube could not be imported.',
          },
        ],
        cursor: cursor({ pageToken: 'page-3' }),
      })
    ).toMatchObject({ state: 'error', resumable: true });
  });

  it('returns disconnected when no authorized account exists', async () => {
    const snapshot = await loadYouTubeImportSnapshot({
      userId: 'user-1',
      creatorProfileId: PROFILE_ID,
      store: createStore().store,
    });
    expect(snapshot).toMatchObject({ state: 'disconnected', resumable: false });
  });

  it('imports one uploads page, resumes from the cursor, and stays idempotent', async () => {
    const firstVideos = [
      video(),
      video({ videoId: 'yt-2', url: 'https://youtube.com/watch?v=yt-2' }),
    ];
    const listPage = vi
      .fn()
      .mockResolvedValueOnce(
        page(firstVideos, 'page-2', [
          { videoId: 'foreign-1', reason: 'wrong_channel' },
        ])
      )
      .mockResolvedValueOnce(
        page(
          [video({ videoId: 'yt-3', url: 'https://youtube.com/watch?v=yt-3' })],
          null
        )
      );
    const { store, saved } = createStore({ accounts: [account()] });
    const first = await importPage(store, provider(listPage));
    expect(first).toMatchObject({
      state: 'partial',
      resumable: true,
      counts: {
        discovered: 3,
        imported: 2,
        skipped: 1,
        failed: 0,
        updated: 0,
      },
      reasons: [{ code: 'wrong_channel', count: 1 }],
    });
    expect(saved[0]).toMatchObject({ pageToken: 'page-2', complete: false });

    const resumed = await importPage(
      createStore({ accounts: [account()], cursor: saved[0] }).store,
      provider(listPage)
    );
    expect(resumed).toMatchObject({
      state: 'populated',
      resumable: false,
      counts: { imported: 3 },
    });
    expect(listPage).toHaveBeenNthCalledWith(2, CHANNEL_ID, {
      pageToken: 'page-2',
    });
  });

  it('fails closed on uncertain identity and keeps quota-limited imports resumable', async () => {
    const idle = provider(vi.fn());
    const mismatched = await importPage(
      createStore({
        accounts: [account()],
        cursor: cursor({
          channelId: 'UC-other',
          providerAccountId: 'UC-other',
          pageToken: 'page-9',
        }),
      }).store,
      idle
    );
    expect(mismatched).toMatchObject({ state: 'error', identity: 'mismatch' });
    expect(idle.listChannelVideosPage).not.toHaveBeenCalled();

    const { store, saved } = createStore({
      accounts: [account()],
      cursor: cursor({
        pageToken: 'page-4',
        counts: { ...emptyYouTubeImportCounts(), discovered: 80, imported: 40 },
        lastSuccessfulObservationAt: '2026-09-16T11:00:00.000Z',
      }),
    });
    const quota = await importPage(
      store,
      provider(
        vi.fn(async () => {
          throw new YouTubeProviderError('quota', 403, 'quotaExceeded');
        })
      )
    );
    expect(quota).toMatchObject({
      state: 'quota-limited',
      resumable: true,
      counts: { imported: 40 },
    });
    expect(saved.at(-1)).toMatchObject({
      pageToken: 'page-4',
      lastErrorCode: 'youtube_quota_limited',
    });
    expect(store.markAccount).toHaveBeenCalledWith(
      'account-1',
      expect.not.objectContaining({ status: 'error' })
    );

    const { store: failedStore, saved: failedSaved } = createStore({
      accounts: [account()],
      cursor: cursor({
        pageToken: 'page-5',
        counts: { ...emptyYouTubeImportCounts(), imported: 12 },
      }),
    });
    const failed = await importPage(
      failedStore,
      provider(
        vi.fn(async () => {
          throw new YouTubeProviderError('backend', 500, 'backendError');
        })
      )
    );
    expect(failed).toMatchObject({
      state: 'error',
      resumable: true,
      counts: { imported: 12 },
    });
    expect(failedSaved.at(-1)).toMatchObject({
      lastErrorCode: 'youtube_sync_failed',
    });
    expect(failedStore.markAccount).toHaveBeenCalledWith('account-1', {
      lastErrorCode: 'youtube_sync_failed',
      lastErrorUserMessage:
        'YouTube could not be imported. Try again or reconnect the channel.',
      status: 'error',
    });
  });
});
