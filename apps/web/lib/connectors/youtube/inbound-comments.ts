import 'server-only';

import { serverFetch } from '@/lib/http/server-fetch';
import { YouTubeProviderError } from './provider';

const YOUTUBE_DATA_API = 'https://www.googleapis.com/youtube/v3';
const THREAD_PART = 'snippet,replies';
const MAX_THREADS_PER_PAGE = 100;
const DEFAULT_MAX_PAGES = 5;
const MAX_VIDEO_TITLE_BATCH = 50;

type ProviderFetch = typeof serverFetch;

/**
 * Moderation buckets a creator can act on. `published` threads are the normal
 * inbound lane; `heldForReview` and `likelySpam` are still ingested so the
 * inbox can bury them under real comments instead of hiding them entirely.
 */
export const YOUTUBE_COMMENT_MODERATION_STATUSES = [
  'published',
  'heldForReview',
  'likelySpam',
] as const;

export type YouTubeCommentModerationStatus =
  (typeof YOUTUBE_COMMENT_MODERATION_STATUSES)[number];

export interface YouTubeInboundComment {
  readonly threadId: string;
  readonly commentId: string;
  readonly videoId: string;
  readonly videoTitle: string | null;
  readonly authorChannelId: string | null;
  readonly authorLabel: string;
  readonly text: string;
  readonly likeCount: number;
  readonly publishedAt: string;
  readonly moderationStatus: YouTubeCommentModerationStatus;
  /** True when any reply in the thread was authored by the owned channel. */
  readonly creatorReplied: boolean;
}

interface CommentSnippet {
  readonly videoId?: string;
  readonly textOriginal?: string;
  readonly textDisplay?: string;
  readonly authorDisplayName?: string;
  readonly authorChannelId?: { readonly value?: string };
  readonly likeCount?: number;
  readonly publishedAt?: string;
}

interface CommentThreadResource {
  readonly id?: string;
  readonly snippet?: {
    readonly videoId?: string;
    readonly topLevelComment?: {
      readonly id?: string;
      readonly snippet?: CommentSnippet;
    };
  };
  readonly replies?: {
    readonly comments?: readonly {
      readonly snippet?: CommentSnippet;
    }[];
  };
}

interface CommentThreadsResponse {
  readonly nextPageToken?: string;
  readonly items?: readonly CommentThreadResource[];
}

interface VideosResponse {
  readonly items?: readonly {
    readonly id?: string;
    readonly snippet?: { readonly title?: string };
  }[];
}

async function authorizedJson<T>(
  url: URL,
  accessToken: string,
  fetcher: ProviderFetch,
  context: string
): Promise<T> {
  const response = await fetcher(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
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

function toInboundComment(
  thread: CommentThreadResource,
  channelId: string,
  moderationStatus: YouTubeCommentModerationStatus
): YouTubeInboundComment | null {
  const threadId = thread.id?.trim();
  const top = thread.snippet?.topLevelComment;
  const snippet = top?.snippet;
  const commentId = top?.id?.trim();
  const videoId = (snippet?.videoId ?? thread.snippet?.videoId ?? '').trim();
  const publishedAt = snippet?.publishedAt?.trim();
  const text = (snippet?.textOriginal ?? snippet?.textDisplay ?? '').trim();
  if (!threadId || !commentId || !videoId || !publishedAt || !text) {
    return null;
  }
  const authorChannelId = snippet?.authorChannelId?.value?.trim() || null;
  const creatorReplied = (thread.replies?.comments ?? []).some(
    reply => reply.snippet?.authorChannelId?.value?.trim() === channelId
  );
  return {
    threadId,
    commentId,
    videoId,
    videoTitle: null,
    authorChannelId,
    authorLabel: snippet?.authorDisplayName?.trim() || 'YouTube commenter',
    text,
    likeCount:
      typeof snippet?.likeCount === 'number' &&
      Number.isFinite(snippet.likeCount)
        ? Math.max(0, Math.trunc(snippet.likeCount))
        : 0,
    publishedAt,
    moderationStatus,
    creatorReplied,
  };
}

async function listThreadsForModerationStatus(input: {
  readonly channelId: string;
  readonly moderationStatus: YouTubeCommentModerationStatus;
  readonly accessToken: string;
  readonly fetcher: ProviderFetch;
  readonly maxPages: number;
}): Promise<YouTubeInboundComment[]> {
  const comments: YouTubeInboundComment[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < input.maxPages; page += 1) {
    const url = new URL(`${YOUTUBE_DATA_API}/commentThreads`);
    url.searchParams.set('part', THREAD_PART);
    url.searchParams.set('allThreadsRelatedToChannelId', input.channelId);
    url.searchParams.set('maxResults', String(MAX_THREADS_PER_PAGE));
    url.searchParams.set('order', 'time');
    url.searchParams.set('textFormat', 'plainText');
    url.searchParams.set('moderationStatus', input.moderationStatus);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const data = await authorizedJson<CommentThreadsResponse>(
      url,
      input.accessToken,
      input.fetcher,
      'YouTube comment threads'
    );
    for (const thread of data.items ?? []) {
      const comment = toInboundComment(
        thread,
        input.channelId,
        input.moderationStatus
      );
      if (comment) comments.push(comment);
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return comments;
}

async function loadVideoTitles(input: {
  readonly videoIds: readonly string[];
  readonly accessToken: string;
  readonly fetcher: ProviderFetch;
}): Promise<ReadonlyMap<string, string>> {
  const titles = new Map<string, string>();
  for (
    let index = 0;
    index < input.videoIds.length;
    index += MAX_VIDEO_TITLE_BATCH
  ) {
    const batch = input.videoIds.slice(index, index + MAX_VIDEO_TITLE_BATCH);
    const url = new URL(`${YOUTUBE_DATA_API}/videos`);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('id', batch.join(','));
    const data = await authorizedJson<VideosResponse>(
      url,
      input.accessToken,
      input.fetcher,
      'YouTube comment video titles'
    );
    for (const item of data.items ?? []) {
      const title = item.snippet?.title?.trim();
      if (item.id && title) titles.set(item.id, title);
    }
  }
  return titles;
}

/**
 * Lists top-level comment threads across every video on the owned channel via
 * `commentThreads.list` (`allThreadsRelatedToChannelId`). Each list page costs
 * one quota unit; `maxPages` bounds the crawl per moderation bucket.
 */
export async function listYouTubeInboundComments(input: {
  readonly accessToken: string;
  readonly channelId: string;
  readonly fetcher?: ProviderFetch;
  readonly maxPages?: number;
}): Promise<YouTubeInboundComment[]> {
  const fetcher = input.fetcher ?? serverFetch;
  const maxPages = Math.max(1, input.maxPages ?? DEFAULT_MAX_PAGES);
  const seen = new Set<string>();
  const comments: YouTubeInboundComment[] = [];

  for (const moderationStatus of YOUTUBE_COMMENT_MODERATION_STATUSES) {
    for (const comment of await listThreadsForModerationStatus({
      channelId: input.channelId,
      moderationStatus,
      accessToken: input.accessToken,
      fetcher,
      maxPages,
    })) {
      if (seen.has(comment.threadId)) continue;
      seen.add(comment.threadId);
      comments.push(comment);
    }
  }

  const videoIds = [...new Set(comments.map(comment => comment.videoId))];
  const titles = await loadVideoTitles({
    videoIds,
    accessToken: input.accessToken,
    fetcher,
  });
  return comments.map(comment => ({
    ...comment,
    videoTitle: titles.get(comment.videoId) ?? null,
  }));
}
