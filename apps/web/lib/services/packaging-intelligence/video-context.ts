import 'server-only';

import { serverFetch } from '@/lib/http/server-fetch';
import { logger } from '@/lib/utils/logger';

export interface YouTubeVideoContext {
  readonly title: string;
  readonly description: string;
  readonly thumbnailUrl?: string;
}

interface YouTubeSnippetResponse {
  items?: Array<{
    snippet?: {
      title?: string;
      description?: string;
      thumbnails?: {
        maxres?: { url?: string };
        high?: { url?: string };
        medium?: { url?: string };
        default?: { url?: string };
      };
    };
  }>;
}

function getBestThumbnail(
  thumbnails: NonNullable<
    NonNullable<YouTubeSnippetResponse['items']>[number]['snippet']
  >['thumbnails']
): string | undefined {
  return (
    thumbnails?.maxres?.url ??
    thumbnails?.high?.url ??
    thumbnails?.medium?.url ??
    thumbnails?.default?.url
  );
}

/** Fetch title, description, and thumbnail via YouTube Data API v3. */
export async function fetchYouTubeVideoContext(
  videoId: string
): Promise<YouTubeVideoContext | null> {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY;
  if (!apiKey) {
    logger.warn('[packaging-intelligence] YOUTUBE_DATA_API_KEY not configured');
    return null;
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('id', videoId);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('key', apiKey);

  try {
    const response = await serverFetch(url.toString(), {
      timeoutMs: 10_000,
      context: 'YouTube videos.list',
    });

    if (!response.ok) {
      logger.warn('[packaging-intelligence] videos.list failed', {
        videoId,
        status: response.status,
      });
      return null;
    }

    const data = (await response.json()) as YouTubeSnippetResponse;
    const snippet = data.items?.[0]?.snippet;
    if (!snippet?.title) return null;

    return {
      title: snippet.title,
      description: snippet.description ?? '',
      thumbnailUrl: getBestThumbnail(snippet.thumbnails),
    };
  } catch (error) {
    logger.warn('[packaging-intelligence] videos.list error', {
      videoId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
