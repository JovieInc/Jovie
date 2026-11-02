import 'server-only';

import { serverFetch } from '@/lib/http/server-fetch';
import { logger } from '@/lib/utils/logger';
import type { ChannelPlanChannel, ChannelPlanVideo } from './channel-plan';
import { parseYouTubeChannelInput } from './resolve-channel';

/**
 * Public channel data for the chat YouTube plan, from the official YouTube
 * Data API v3 only (social HTML is never fetched from core IPs; see
 * lib/ingestion/social-html-policy.ts). Quota: at most 10 units per call
 * (1 channels + up to 4 playlistItems pages + up to 4 videos batches + 1
 * playlists; 1 unit each) against the 10,000/day project default. Bounded by the chat message limit: one call per
 * tool invocation, at most one invocation per turn step.
 *
 * Fail-soft: no key, a bad ref or any API error returns a reason, never throws,
 * so the plan falls back to profile + catalog data.
 */

const API = 'https://www.googleapis.com/youtube/v3';
/** Legacy hits are often old: scan up to 200 uploads, 50 per page. */
const UPLOADS_PAGE = 50;
const UPLOADS_PAGES = 4;
const TOP_VIDEOS = 10;

export type ChannelAuditData =
  | {
      readonly ok: true;
      readonly channel: ChannelPlanChannel;
      readonly topVideos: readonly ChannelPlanVideo[];
    }
  | {
      readonly ok: false;
      readonly reason:
        | 'no_api_key'
        | 'bad_channel_ref'
        | 'not_found'
        | 'api_error';
    };

interface ChannelsResponse {
  readonly items?: readonly {
    readonly id?: string;
    readonly snippet?: {
      readonly title?: string;
      readonly description?: string;
    };
    readonly statistics?: {
      readonly subscriberCount?: string;
      readonly videoCount?: string;
      readonly hiddenSubscriberCount?: boolean;
    };
    readonly contentDetails?: {
      readonly relatedPlaylists?: { readonly uploads?: string };
    };
  }[];
}

interface PlaylistItemsResponse {
  readonly nextPageToken?: string;
  readonly items?: readonly {
    readonly contentDetails?: {
      readonly videoId?: string;
      readonly videoPublishedAt?: string;
    };
  }[];
}

interface VideosResponse {
  readonly items?: readonly {
    readonly id?: string;
    readonly snippet?: {
      readonly title?: string;
      readonly description?: string;
      readonly publishedAt?: string;
    };
    readonly statistics?: { readonly viewCount?: string };
  }[];
}

interface PlaylistsResponse {
  readonly pageInfo?: { readonly totalResults?: number };
}

type FetchLike = typeof serverFetch;

function toCount(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function getJson<T>(
  url: URL,
  context: string,
  fetchImpl: FetchLike
): Promise<T | null> {
  const response = await fetchImpl(url.toString(), {
    timeoutMs: 8_000,
    context,
  });
  if (!response.ok) {
    logger.warn('[youtube-channel-audit] Data API non-OK', {
      context,
      status: response.status,
    });
    return null;
  }
  return (await response.json()) as T;
}

export async function fetchChannelAuditData(
  channelUrl: string,
  options: { apiKey?: string; fetchImpl?: FetchLike } = {}
): Promise<ChannelAuditData> {
  const apiKey = (options.apiKey ?? process.env.YOUTUBE_DATA_API_KEY)?.trim();
  if (!apiKey) return { ok: false, reason: 'no_api_key' };
  const ref = parseYouTubeChannelInput(channelUrl);
  if (!ref) return { ok: false, reason: 'bad_channel_ref' };
  const fetchImpl = options.fetchImpl ?? serverFetch;

  try {
    const channelsUrl = new URL(`${API}/channels`);
    channelsUrl.searchParams.set('part', 'snippet,statistics,contentDetails');
    channelsUrl.searchParams.set('key', apiKey);
    if (ref.kind === 'handle')
      channelsUrl.searchParams.set('forHandle', `@${ref.value}`);
    if (ref.kind === 'id') channelsUrl.searchParams.set('id', ref.value);
    if (ref.kind === 'username')
      channelsUrl.searchParams.set('forUsername', ref.value);
    const channels = await getJson<ChannelsResponse>(
      channelsUrl,
      'YouTube channels.list (chat audit)',
      fetchImpl
    );
    if (!channels) return { ok: false, reason: 'api_error' };
    const item = channels.items?.[0];
    const uploads = item?.contentDetails?.relatedPlaylists?.uploads;
    if (!item?.id || !uploads) return { ok: false, reason: 'not_found' };

    const playlistsUrl = new URL(`${API}/playlists`);
    playlistsUrl.searchParams.set('part', 'id');
    playlistsUrl.searchParams.set('channelId', item.id);
    playlistsUrl.searchParams.set('maxResults', '1');
    playlistsUrl.searchParams.set('key', apiKey);
    const playlistsPromise = getJson<PlaylistsResponse>(
      playlistsUrl,
      'YouTube playlists.list (chat audit)',
      fetchImpl
    );

    const uploadsList: NonNullable<PlaylistItemsResponse['items']>[number][] =
      [];
    let pageToken: string | undefined;
    for (let page = 0; page < UPLOADS_PAGES; page += 1) {
      const itemsUrl = new URL(`${API}/playlistItems`);
      itemsUrl.searchParams.set('part', 'contentDetails');
      itemsUrl.searchParams.set('playlistId', uploads);
      itemsUrl.searchParams.set('maxResults', String(UPLOADS_PAGE));
      itemsUrl.searchParams.set('key', apiKey);
      if (pageToken) itemsUrl.searchParams.set('pageToken', pageToken);
      const items = await getJson<PlaylistItemsResponse>(
        itemsUrl,
        'YouTube playlistItems.list (chat audit)',
        fetchImpl
      );
      uploadsList.push(...(items?.items ?? []));
      pageToken = items?.nextPageToken;
      if (!pageToken) break;
    }
    const videoIds = uploadsList
      .map(entry => entry.contentDetails?.videoId)
      .filter((id): id is string => Boolean(id));
    const lastUploadAt =
      uploadsList
        .map(entry => entry.contentDetails?.videoPublishedAt ?? '')
        .sort()
        .at(-1) || null;

    const batches: string[][] = [];
    for (let i = 0; i < videoIds.length; i += UPLOADS_PAGE) {
      batches.push(videoIds.slice(i, i + UPLOADS_PAGE));
    }
    const videoPages = await Promise.all(
      batches.map(ids => {
        const videosUrl = new URL(`${API}/videos`);
        videosUrl.searchParams.set('part', 'snippet,statistics');
        videosUrl.searchParams.set('id', ids.join(','));
        videosUrl.searchParams.set('key', apiKey);
        return getJson<VideosResponse>(
          videosUrl,
          'YouTube videos.list (chat audit)',
          fetchImpl
        );
      })
    );
    const topVideos: ChannelPlanVideo[] = videoPages
      .flatMap(page => page?.items ?? [])
      .filter(video => Boolean(video.id))
      .map(video => ({
        videoId: video.id ?? '',
        title: video.snippet?.title ?? '',
        viewCount: toCount(video.statistics?.viewCount),
        description: video.snippet?.description ?? '',
        publishedAt: video.snippet?.publishedAt ?? null,
      }))
      .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
      .slice(0, TOP_VIDEOS);
    const playlists = await playlistsPromise;

    return {
      ok: true,
      channel: {
        title: item.snippet?.title ?? '',
        subscriberCount: item.statistics?.hiddenSubscriberCount
          ? null
          : toCount(item.statistics?.subscriberCount),
        videoCount: toCount(item.statistics?.videoCount),
        description: item.snippet?.description ?? '',
        playlistCount: playlists?.pageInfo?.totalResults ?? null,
        lastUploadAt,
      },
      topVideos,
    };
  } catch (error) {
    logger.warn('[youtube-channel-audit] Data API call failed', { error });
    return { ok: false, reason: 'api_error' };
  }
}
