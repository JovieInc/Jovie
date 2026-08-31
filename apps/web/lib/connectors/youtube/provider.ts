import 'server-only';

import type { YouTubeThumbnailSet } from '@/lib/db/schema/youtube-library';
import { serverFetch } from '@/lib/http/server-fetch';
import { parseYouTubeDuration } from '@/lib/youtube/metadata';
import type {
  YouTubeChannelVideo,
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
  readonly items?: readonly {
    readonly id: string;
    readonly snippet?: {
      readonly channelId?: string;
      readonly title?: string;
      readonly description?: string;
      readonly publishedAt?: string;
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
  constructor(message: string, status: number) {
    super(message);
    this.name = 'YouTubeProviderError';
    this.status = status;
  }
}

async function authorizedJson<T>(
  url: URL,
  accessToken: string,
  fetcher: ProviderFetch,
  context: string,
  timeoutMs = 15_000
): Promise<T> {
  const response = await fetcher(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeoutMs,
    context,
  });
  if (!response.ok) {
    throw new YouTubeProviderError(
      `${context} failed with status ${response.status}`,
      response.status
    );
  }
  return (await response.json()) as T;
}

export async function listOwnedYouTubeChannels(input: {
  readonly accessToken: string;
  readonly fetcher?: ProviderFetch;
  readonly timeoutMs?: number;
}): Promise<OwnedYouTubeChannel[]> {
  const url = new URL(`${YOUTUBE_DATA_API}/channels`);
  url.searchParams.set('part', 'id,snippet,contentDetails');
  url.searchParams.set('mine', 'true');
  const data = await authorizedJson<ChannelResponse>(
    url,
    input.accessToken,
    input.fetcher ?? serverFetch,
    'YouTube channel lookup',
    input.timeoutMs
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
  readonly maxVideoIds?: number;
  readonly pageToken?: string;
  readonly timeoutMs?: number;
}): Promise<{
  readonly videoIds: string[];
  readonly nextPageToken: string | null;
}> {
  const ids: string[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined = input.pageToken;
  do {
    const remaining = input.maxVideoIds
      ? input.maxVideoIds - ids.length
      : MAX_VIDEO_BATCH;
    const url = new URL(`${YOUTUBE_DATA_API}/playlistItems`);
    url.searchParams.set('part', 'contentDetails');
    url.searchParams.set('playlistId', input.uploadsPlaylistId);
    url.searchParams.set(
      'maxResults',
      String(Math.max(1, Math.min(MAX_VIDEO_BATCH, remaining)))
    );
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const page = await authorizedJson<PlaylistItemsResponse>(
      url,
      input.accessToken,
      input.fetcher,
      'YouTube uploads page',
      input.timeoutMs
    );
    for (const item of page.items ?? []) {
      const videoId = item.contentDetails?.videoId?.trim();
      if (videoId && !seen.has(videoId)) {
        ids.push(videoId);
        seen.add(videoId);
      }
      if (input.maxVideoIds && ids.length >= input.maxVideoIds) {
        return {
          videoIds: ids.slice(0, input.maxVideoIds),
          nextPageToken: page.nextPageToken ?? null,
        };
      }
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return { videoIds: ids, nextPageToken: null };
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

function boundedTimeoutMs(timeoutMs: number, deadlineMs?: number): number {
  return deadlineMs === undefined
    ? timeoutMs
    : Math.max(1_000, Math.min(timeoutMs, deadlineMs - Date.now()));
}

function hasRequestBudget(timeoutMs: number, deadlineMs?: number): boolean {
  return deadlineMs === undefined || Date.now() + timeoutMs <= deadlineMs;
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
  readonly maxVideosPerSync?: number;
  readonly uploadsPageToken?: string;
  readonly onUploadsPageToken?: (pageToken: string | null) => void;
  readonly timeoutMs?: number;
  readonly maxAnalyticsRequests?: number;
  readonly deadlineMs?: number;
}): YouTubeLibraryProvider {
  const fetcher = input.fetcher ?? serverFetch;
  const now = input.now ?? (() => new Date());
  const timeoutMs = input.timeoutMs ?? 15_000;
  return {
    async listChannelVideos(channelId) {
      const channels = await listOwnedYouTubeChannels({
        accessToken: input.accessToken,
        fetcher,
        timeoutMs: boundedTimeoutMs(timeoutMs, input.deadlineMs),
      });
      const channel = channels.find(item => item.id === channelId);
      if (!channel) {
        throw new YouTubeProviderError(
          'The authorized account does not own the selected YouTube channel',
          403
        );
      }
      const { videoIds, nextPageToken } = await listUploadVideoIds({
        uploadsPlaylistId: channel.uploadsPlaylistId,
        accessToken: input.accessToken,
        fetcher,
        maxVideoIds: input.maxVideosPerSync,
        pageToken: input.uploadsPageToken,
        timeoutMs: boundedTimeoutMs(timeoutMs, input.deadlineMs),
      });
      input.onUploadsPageToken?.(nextPageToken);
      const videos: YouTubeChannelVideo[] = [];
      for (const batch of batches(videoIds, MAX_VIDEO_BATCH)) {
        const url = new URL(`${YOUTUBE_DATA_API}/videos`);
        url.searchParams.set('part', 'snippet,contentDetails,status');
        url.searchParams.set('id', batch.join(','));
        const data = await authorizedJson<VideosResponse>(
          url,
          input.accessToken,
          fetcher,
          'YouTube video details',
          boundedTimeoutMs(timeoutMs, input.deadlineMs)
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
      let requestCount = 0;
      for (const window of windows) {
        const { start, end } = metricRange(window, now());
        for (const batch of batches(videoIds, analyticsBatchSize(start, end))) {
          if (
            input.maxAnalyticsRequests !== undefined &&
            requestCount >= input.maxAnalyticsRequests
          ) {
            return output;
          }
          if (!hasRequestBudget(timeoutMs, input.deadlineMs)) {
            return output;
          }
          requestCount++;
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
            'YouTube analytics report',
            boundedTimeoutMs(timeoutMs, input.deadlineMs)
          );
          output.push(...analyticsRows({ data, window, start, end }));
        }
      }
      return output;
    },
  };
}
