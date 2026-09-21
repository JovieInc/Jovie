import 'server-only';

import type { YouTubeThumbnailSet } from '@/lib/db/schema/youtube-library';
import { serverFetch } from '@/lib/http/server-fetch';
import { parseYouTubeDuration } from '@/lib/youtube/metadata';
import type {
  YouTubeSnippetWriter,
  YouTubeVideoSnippetRecord,
} from '@/lib/youtube-library/link-apply';
import type {
  YouTubeChannelVideo,
  YouTubeImportSkip,
  YouTubeLibraryProvider,
  YouTubeMetricWindow,
  YouTubeVideoMetrics,
} from '@/lib/youtube-library/types';

const YOUTUBE_DATA_API = 'https://www.googleapis.com/youtube/v3';
const YOUTUBE_ANALYTICS_API =
  'https://youtubeanalytics.googleapis.com/v2/reports';
const MAX_VIDEO_BATCH = 50;
const MAX_ANALYTICS_FILTER = 500;
const MAX_ANALYTICS_REPORT_CELLS = 50_000;
const DAY_MS = 86_400_000;

type ProviderFetch = typeof serverFetch;

interface PageInfo {
  readonly nextPageToken?: string;
}

interface ChannelResponse {
  readonly items?: readonly {
    readonly id: string;
    readonly snippet?: { readonly title?: string };
    readonly contentDetails?: {
      readonly relatedPlaylists?: { readonly uploads?: string };
    };
  }[];
}

interface PlaylistItemsResponse extends PageInfo {
  readonly items?: readonly {
    readonly contentDetails?: { readonly videoId?: string };
  }[];
}

interface VideosResponse {
  readonly etag?: string;
  readonly items?: readonly {
    readonly id: string;
    readonly etag?: string;
    readonly snippet?: {
      readonly channelId?: string;
      readonly title?: string;
      readonly description?: string;
      readonly publishedAt?: string;
      readonly categoryId?: string;
      readonly tags?: readonly string[];
      readonly defaultLanguage?: string;
      readonly thumbnails?: YouTubeThumbnailSet;
    };
    readonly contentDetails?: { readonly duration?: string };
    readonly status?: { readonly privacyStatus?: string };
  }[];
}

interface AnalyticsResponse {
  readonly columnHeaders?: readonly { readonly name: string }[];
  readonly rows?: readonly (readonly (string | number | null)[])[];
}

export interface OwnedYouTubeChannel {
  readonly id: string;
  readonly title: string;
  readonly uploadsPlaylistId: string;
}

export class YouTubeProviderError extends Error {
  readonly status: number;
  readonly reason: string | null;
  constructor(message: string, status: number, reason?: string | null) {
    super(message);
    this.name = 'YouTubeProviderError';
    this.status = status;
    this.reason = reason ?? null;
  }
}

async function authorizedJson<T>(
  url: URL,
  accessToken: string,
  fetcher: ProviderFetch,
  context: string,
  init?: { readonly method?: string; readonly body?: string }
): Promise<T> {
  const response = await fetcher(url, {
    method: init?.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init?.body,
    timeoutMs: 15_000,
    context,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      readonly error?: {
        readonly status?: string;
        readonly errors?: readonly { readonly reason?: string }[];
      };
    } | null;
    throw new YouTubeProviderError(
      `${context} failed with status ${response.status}`,
      response.status,
      payload?.error?.errors?.[0]?.reason ?? payload?.error?.status ?? null
    );
  }
  return (await response.json()) as T;
}

export async function listOwnedYouTubeChannels(input: {
  readonly accessToken: string;
  readonly fetcher?: ProviderFetch;
}): Promise<OwnedYouTubeChannel[]> {
  const url = new URL(`${YOUTUBE_DATA_API}/channels`);
  url.searchParams.set('part', 'id,snippet,contentDetails');
  url.searchParams.set('mine', 'true');
  const data = await authorizedJson<ChannelResponse>(
    url,
    input.accessToken,
    input.fetcher ?? serverFetch,
    'YouTube channel lookup'
  );
  return (data.items ?? []).flatMap(item => {
    const uploadsPlaylistId = item.contentDetails?.relatedPlaylists?.uploads;
    if (!item.id || !uploadsPlaylistId) return [];
    return [
      {
        id: item.id,
        title: item.snippet?.title?.trim() || 'YouTube channel',
        uploadsPlaylistId,
      },
    ];
  });
}

async function listUploadVideoIds(input: {
  readonly uploadsPlaylistId: string;
  readonly accessToken: string;
  readonly fetcher: ProviderFetch;
}): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${YOUTUBE_DATA_API}/playlistItems`);
    url.searchParams.set('part', 'contentDetails');
    url.searchParams.set('playlistId', input.uploadsPlaylistId);
    url.searchParams.set('maxResults', '50');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const page = await authorizedJson<PlaylistItemsResponse>(
      url,
      input.accessToken,
      input.fetcher,
      'YouTube uploads page'
    );
    for (const item of page.items ?? []) {
      const videoId = item.contentDetails?.videoId?.trim();
      if (videoId) ids.push(videoId);
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return [...new Set(ids)];
}

function batches<T>(items: readonly T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

function toChannelVideo(
  item: NonNullable<VideosResponse['items']>[number],
  channelId: string
): YouTubeChannelVideo | null {
  if (!item.id || item.snippet?.channelId !== channelId) return null;
  const publishedAt = item.snippet.publishedAt
    ? new Date(item.snippet.publishedAt)
    : null;
  return {
    channelId,
    videoId: item.id,
    title: item.snippet.title?.trim() || 'Untitled video',
    description: item.snippet.description ?? null,
    publishedAt:
      publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
    durationSeconds: item.contentDetails?.duration
      ? parseYouTubeDuration(item.contentDetails.duration)
      : null,
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(item.id)}`,
    privacyStatus: item.status?.privacyStatus ?? null,
    thumbnails: item.snippet.thumbnails ?? {},
  };
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function analyticsBatchSize(start: Date, end: Date): number {
  const inclusiveDays = Math.max(
    1,
    Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1
  );
  return Math.max(
    1,
    Math.min(
      MAX_ANALYTICS_FILTER,
      Math.floor(MAX_ANALYTICS_REPORT_CELLS / inclusiveDays)
    )
  );
}

function metricRange(
  window: YouTubeMetricWindow,
  now: Date
): { start: Date; end: Date } {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)
  );
  const days =
    window === 'day_1'
      ? 1
      : window === 'day_7'
        ? 7
        : window === 'day_28' || window === 'experiment'
          ? 28
          : window === 'day_90'
            ? 90
            : null;
  const start =
    days === null
      ? new Date(Date.UTC(2005, 1, 14))
      : new Date(end.getTime() - (days - 1) * DAY_MS);
  return { start, end };
}

function analyticsRows(input: {
  readonly data: AnalyticsResponse;
  readonly window: YouTubeMetricWindow;
  readonly start: Date;
  readonly end: Date;
}): YouTubeVideoMetrics[] {
  const headers = input.data.columnHeaders?.map(header => header.name) ?? [];
  const index = (name: string) => headers.indexOf(name);
  const videoIndex = index('video');
  const viewsIndex = index('views');
  const watchIndex = index('estimatedMinutesWatched');
  const durationIndex = index('averageViewDuration');
  if (videoIndex < 0) return [];
  return (input.data.rows ?? []).flatMap(row => {
    const videoId = String(row[videoIndex] ?? '').trim();
    if (!videoId) return [];
    const numberAt = (position: number): number | null => {
      if (position < 0 || row[position] === null) return null;
      const value = Number(row[position]);
      return Number.isFinite(value) ? value : null;
    };
    return [
      {
        videoId,
        window: input.window,
        windowStart: input.start,
        windowEnd: input.end,
        impressions: null,
        ctr: null,
        views: numberAt(viewsIndex),
        watchTimeMinutes: numberAt(watchIndex),
        watchTimePerImpression: null,
        avgViewDurationSeconds: numberAt(durationIndex),
        trafficSources: null,
      },
    ];
  });
}

export function createYouTubeLibraryProvider(input: {
  readonly accessToken: string;
  readonly now?: () => Date;
  readonly fetcher?: ProviderFetch;
}): YouTubeLibraryProvider {
  const fetcher = input.fetcher ?? serverFetch;
  const now = input.now ?? (() => new Date());
  return {
    async listChannelVideosPage(channelId, pageInput) {
      const channels = await listOwnedYouTubeChannels({
        accessToken: input.accessToken,
        fetcher,
      });
      const channel = channels.find(item => item.id === channelId);
      if (!channel) {
        throw new YouTubeProviderError(
          'The authorized account does not own the selected YouTube channel',
          403,
          'channelMismatch'
        );
      }
      const url = new URL(`${YOUTUBE_DATA_API}/playlistItems`);
      url.searchParams.set('part', 'contentDetails');
      url.searchParams.set('playlistId', channel.uploadsPlaylistId);
      url.searchParams.set('maxResults', '50');
      if (pageInput?.pageToken) {
        url.searchParams.set('pageToken', pageInput.pageToken);
      }
      const playlist = await authorizedJson<PlaylistItemsResponse>(
        url,
        input.accessToken,
        fetcher,
        'YouTube uploads page'
      );
      const skipped: YouTubeImportSkip[] = [];
      const ids: string[] = [];
      for (const item of playlist.items ?? []) {
        const videoId = item.contentDetails?.videoId?.trim();
        if (videoId) ids.push(videoId);
        else skipped.push({ videoId: null, reason: 'missing_id' });
      }
      const videos: YouTubeChannelVideo[] = [];
      const found = new Set<string>();
      if (ids.length > 0) {
        const details = new URL(`${YOUTUBE_DATA_API}/videos`);
        details.searchParams.set('part', 'snippet,contentDetails,status');
        details.searchParams.set('id', ids.join(','));
        const data = await authorizedJson<VideosResponse>(
          details,
          input.accessToken,
          fetcher,
          'YouTube video details'
        );
        for (const item of data.items ?? []) {
          const video = toChannelVideo(item, channelId);
          const videoId = item.id?.trim() || null;
          if (!video) {
            skipped.push({
              videoId,
              reason: 'wrong_channel',
            });
            if (videoId) found.add(videoId);
            continue;
          }
          found.add(video.videoId);
          videos.push(video);
        }
      }
      for (const videoId of ids) {
        if (!found.has(videoId))
          skipped.push({ videoId, reason: 'missing_id' });
      }
      return {
        channelId: channel.id,
        channelTitle: channel.title,
        uploadsPlaylistId: channel.uploadsPlaylistId,
        videos,
        nextPageToken: playlist.nextPageToken ?? null,
        skipped,
      };
    },

    async listChannelVideos(channelId) {
      const channels = await listOwnedYouTubeChannels({
        accessToken: input.accessToken,
        fetcher,
      });
      const channel = channels.find(item => item.id === channelId);
      if (!channel) {
        throw new YouTubeProviderError(
          'The authorized account does not own the selected YouTube channel',
          403
        );
      }
      const videoIds = await listUploadVideoIds({
        uploadsPlaylistId: channel.uploadsPlaylistId,
        accessToken: input.accessToken,
        fetcher,
      });
      const videos: YouTubeChannelVideo[] = [];
      for (const batch of batches(videoIds, MAX_VIDEO_BATCH)) {
        const url = new URL(`${YOUTUBE_DATA_API}/videos`);
        url.searchParams.set('part', 'snippet,contentDetails,status');
        url.searchParams.set('id', batch.join(','));
        const data = await authorizedJson<VideosResponse>(
          url,
          input.accessToken,
          fetcher,
          'YouTube video details'
        );
        for (const item of data.items ?? []) {
          const video = toChannelVideo(item, channelId);
          if (video) videos.push(video);
        }
      }
      return videos;
    },

    async fetchVideoMetrics(channelId, videoIds, windows) {
      const output: YouTubeVideoMetrics[] = [];
      for (const window of windows) {
        const { start, end } = metricRange(window, now());
        for (const batch of batches(videoIds, analyticsBatchSize(start, end))) {
          const url = new URL(YOUTUBE_ANALYTICS_API);
          url.searchParams.set('ids', `channel==${channelId}`);
          url.searchParams.set('startDate', dateOnly(start));
          url.searchParams.set('endDate', dateOnly(end));
          url.searchParams.set(
            'metrics',
            'views,estimatedMinutesWatched,averageViewDuration'
          );
          url.searchParams.set('dimensions', 'video');
          url.searchParams.set('filters', `video==${batch.join(',')}`);
          const data = await authorizedJson<AnalyticsResponse>(
            url,
            input.accessToken,
            fetcher,
            'YouTube analytics report'
          );
          output.push(...analyticsRows({ data, window, start, end }));
        }
      }
      return output;
    },
  };
}

type VideoRow = NonNullable<VideosResponse['items']>[number];

function toSnippetRecord(item: VideoRow): YouTubeVideoSnippetRecord | null {
  if (!item.id || !item.snippet?.title) return null;
  return {
    id: item.id,
    etag: item.etag ?? null,
    snippet: {
      title: item.snippet.title.trim() || 'Untitled video',
      description: item.snippet.description ?? '',
      categoryId: item.snippet.categoryId ?? null,
      tags: item.snippet.tags,
      defaultLanguage: item.snippet.defaultLanguage,
      channelId: item.snippet.channelId,
    },
  };
}

export function createYouTubeSnippetWriter(input: {
  readonly accessToken: string;
  readonly fetcher?: ProviderFetch;
}): YouTubeSnippetWriter {
  const fetcher = input.fetcher ?? serverFetch;
  const videoUrl = (id?: string) => {
    const url = new URL(`${YOUTUBE_DATA_API}/videos`);
    url.searchParams.set('part', 'snippet');
    if (id) url.searchParams.set('id', id);
    return url;
  };
  return {
    async getVideo(videoId) {
      const data = await authorizedJson<VideosResponse>(
        videoUrl(videoId),
        input.accessToken,
        fetcher,
        'YouTube video snippet'
      );
      return data.items?.[0] ? toSnippetRecord(data.items[0]) : null;
    },
    async updateVideo(update) {
      const snippet = {
        title: update.snippet.title,
        description: update.snippet.description,
        ...(update.snippet.categoryId
          ? { categoryId: update.snippet.categoryId }
          : {}),
        ...(update.snippet.tags ? { tags: update.snippet.tags } : {}),
        ...(update.snippet.defaultLanguage
          ? { defaultLanguage: update.snippet.defaultLanguage }
          : {}),
      };
      const data = await authorizedJson<VideosResponse & VideoRow>(
        videoUrl(),
        input.accessToken,
        fetcher,
        'YouTube video update',
        {
          method: 'PUT',
          body: JSON.stringify({
            id: update.videoId,
            snippet,
            ...(update.etag ? { etag: update.etag } : {}),
          }),
        }
      );
      const item = data.items?.[0] ?? (data.id ? data : null);
      const record = item ? toSnippetRecord(item) : null;
      if (!record) {
        throw new YouTubeProviderError(
          'YouTube video update returned no snippet',
          502,
          'ambiguousProviderResult'
        );
      }
      return record;
    },
  };
}
