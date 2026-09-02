import 'server-only';

import { serverFetch } from '@/lib/http/server-fetch';
import { logger } from '@/lib/utils/logger';

/**
 * Public (API-key) YouTube channel resolution for the paste-channel lander
 * (JOV-5862). No OAuth — public thumbnails need none. `thumbnails.set`
 * (apply) stays behind the OAuth connector (JOV-3189).
 */

const YOUTUBE_DATA_API = 'https://www.googleapis.com/youtube/v3';
const MAX_INPUT_LENGTH = 200;
const HANDLE_PATTERN = /^[A-Za-z0-9._-]{3,30}$/;
const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;

export type YouTubeChannelRef =
  | { readonly kind: 'handle'; readonly value: string }
  | { readonly kind: 'id'; readonly value: string }
  | { readonly kind: 'username'; readonly value: string };

export interface YouTubeResolvedChannel {
  readonly channelId: string;
  readonly title: string;
  readonly handle: string | null;
  readonly uploadsPlaylistId: string;
}

export interface YouTubeRecentVideo {
  readonly videoId: string;
  readonly title: string;
  readonly thumbnailUrl: string;
  readonly publishedAt: string | null;
}

export class YouTubeDataApiUnavailableError extends Error {
  readonly code = 'youtube_data_api_unavailable' as const;
  constructor(message = 'YOUTUBE_DATA_API_KEY is not configured') {
    super(message);
    this.name = 'YouTubeDataApiUnavailableError';
  }
}

type FetchLike = typeof serverFetch;

function readApiKey(): string {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY?.trim();
  if (!apiKey) {
    throw new YouTubeDataApiUnavailableError();
  }
  return apiKey;
}

function stripHost(raw: string): string | null {
  let candidate = raw;
  if (!/^https?:\/\//i.test(candidate)) {
    if (/^(?:www\.|m\.)?youtube\.com\//i.test(candidate)) {
      candidate = `https://${candidate}`;
    } else {
      return null;
    }
  }
  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase().replace(/^(?:www|m)\./, '');
    if (host !== 'youtube.com') return null;
    return url.pathname;
  } catch {
    return null;
  }
}

/**
 * Accepts `@handle`, `handle`, `UC…` ids, and youtube.com links of the
 * forms `/@handle`, `/channel/UC…`, `/c/name`, `/user/name`. Returns null
 * for anything else — invalid input never reaches the API.
 */
export function parseYouTubeChannelInput(
  raw: string
): YouTubeChannelRef | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_INPUT_LENGTH) return null;

  const pathname = stripHost(trimmed);
  if (pathname !== null) {
    const segments = pathname.split('/').filter(Boolean);
    const [first, second] = segments;
    if (!first) return null;
    if (first.startsWith('@')) {
      const handle = first.slice(1);
      return HANDLE_PATTERN.test(handle) ? { kind: 'handle', value: handle } : null;
    }
    if (first === 'channel' && second && CHANNEL_ID_PATTERN.test(second)) {
      return { kind: 'id', value: second };
    }
    if ((first === 'c' || first === 'user') && second) {
      return HANDLE_PATTERN.test(second)
        ? { kind: 'username', value: second }
        : null;
    }
    return null;
  }

  if (CHANNEL_ID_PATTERN.test(trimmed)) {
    return { kind: 'id', value: trimmed };
  }

  const handle = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  if (HANDLE_PATTERN.test(handle)) {
    return { kind: 'handle', value: handle };
  }
  return null;
}

interface ChannelsListResponse {
  readonly items?: readonly {
    readonly id?: string;
    readonly snippet?: {
      readonly title?: string;
      readonly customUrl?: string;
    };
    readonly contentDetails?: {
      readonly relatedPlaylists?: { readonly uploads?: string };
    };
  }[];
}

interface PlaylistItemsResponse {
  readonly items?: readonly {
    readonly contentDetails?: { readonly videoId?: string };
  }[];
}

interface VideosListResponse {
  readonly items?: readonly {
    readonly id?: string;
    readonly snippet?: {
      readonly title?: string;
      readonly publishedAt?: string;
      readonly thumbnails?: ThumbnailSet;
    };
    readonly status?: { readonly privacyStatus?: string };
  }[];
}

async function fetchJson<T>(
  url: URL,
  context: string,
  fetchImpl: FetchLike
): Promise<T | null> {
  const response = await fetchImpl(url.toString(), {
    timeoutMs: 10_000,
    context,
  });
  if (!response.ok) {
    logger.warn('[youtube-thumbnails] Data API non-OK', {
      context,
      status: response.status,
    });
    return null;
  }
  return (await response.json()) as T;
}

type ThumbnailSet = Record<string, { readonly url?: string } | undefined>;

function bestThumbnail(thumbnails: ThumbnailSet | undefined): string | undefined {
  const set: ThumbnailSet = thumbnails ?? {};
  return (
    set.maxres?.url ??
    set.standard?.url ??
    set.high?.url ??
    set.medium?.url ??
    set.default?.url
  );
}

export async function resolveYouTubeChannel(
  ref: YouTubeChannelRef,
  fetchImpl: FetchLike = serverFetch
): Promise<YouTubeResolvedChannel | null> {
  const apiKey = readApiKey();
  const url = new URL(`${YOUTUBE_DATA_API}/channels`);
  url.searchParams.set('part', 'snippet,contentDetails');
  url.searchParams.set('maxResults', '1');
  url.searchParams.set('key', apiKey);
  if (ref.kind === 'handle') url.searchParams.set('forHandle', `@${ref.value}`);
  if (ref.kind === 'id') url.searchParams.set('id', ref.value);
  if (ref.kind === 'username') url.searchParams.set('forUsername', ref.value);

  const data = await fetchJson<ChannelsListResponse>(
    url,
    'YouTube channels.list',
    fetchImpl
  );
  const item = data?.items?.[0];
  const uploads = item?.contentDetails?.relatedPlaylists?.uploads;
  if (!item?.id || !uploads) return null;

  const customUrl = item.snippet?.customUrl ?? null;
  return {
    channelId: item.id,
    title: item.snippet?.title ?? item.id,
    handle: customUrl ? customUrl.replace(/^@/, '') : null,
    uploadsPlaylistId: uploads,
  };
}

/**
 * Most recent public uploads with a usable thumbnail, newest first.
 */
export async function listRecentPublicVideos(
  uploadsPlaylistId: string,
  limit: number,
  fetchImpl: FetchLike = serverFetch
): Promise<readonly YouTubeRecentVideo[]> {
  const apiKey = readApiKey();

  const playlistUrl = new URL(`${YOUTUBE_DATA_API}/playlistItems`);
  playlistUrl.searchParams.set('part', 'contentDetails');
  playlistUrl.searchParams.set('playlistId', uploadsPlaylistId);
  playlistUrl.searchParams.set('maxResults', '12');
  playlistUrl.searchParams.set('key', apiKey);

  const playlist = await fetchJson<PlaylistItemsResponse>(
    playlistUrl,
    'YouTube playlistItems.list',
    fetchImpl
  );
  const videoIds = (playlist?.items ?? [])
    .map(entry => entry.contentDetails?.videoId)
    .filter((id): id is string => Boolean(id));
  if (videoIds.length === 0) return [];

  const videosUrl = new URL(`${YOUTUBE_DATA_API}/videos`);
  videosUrl.searchParams.set('part', 'snippet,status');
  videosUrl.searchParams.set('id', videoIds.join(','));
  videosUrl.searchParams.set('key', apiKey);

  const videos = await fetchJson<VideosListResponse>(
    videosUrl,
    'YouTube videos.list',
    fetchImpl
  );

  return (videos?.items ?? [])
    .filter(video => (video.status?.privacyStatus ?? 'public') === 'public')
    .map(video => {
      const thumbnailUrl = bestThumbnail(video.snippet?.thumbnails);
      if (!video.id || !thumbnailUrl) return null;
      return {
        videoId: video.id,
        title: video.snippet?.title ?? video.id,
        thumbnailUrl,
        publishedAt: video.snippet?.publishedAt ?? null,
      } satisfies YouTubeRecentVideo;
    })
    .filter((video): video is YouTubeRecentVideo => video !== null)
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
    .slice(0, limit);
}
