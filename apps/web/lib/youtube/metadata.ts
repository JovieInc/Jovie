/**
 * YouTube Metadata Fetcher
 *
 * Fetches video metadata from YouTube Data API v3.
 * Graceful degradation: returns null on any failure,
 * allowing release creation with just the video ID.
 */

import type { MusicVideoMetadata } from '@/lib/discography/types';

interface YouTubeApiSnippet {
  title: string;
  thumbnails: {
    maxres?: { url: string };
    high?: { url: string };
    medium?: { url: string };
    default?: { url: string };
  };
  channelId: string;
  channelTitle: string;
}

interface YouTubeApiContentDetails {
  duration: string; // ISO 8601 (e.g., "PT4M33S")
}

interface YouTubeApiLiveStreamingDetails {
  scheduledStartTime?: string; // ISO 8601
}

interface YouTubeApiVideoItem {
  snippet: YouTubeApiSnippet;
  contentDetails: YouTubeApiContentDetails;
  liveStreamingDetails?: YouTubeApiLiveStreamingDetails;
}

interface YouTubeApiResponse {
  items?: YouTubeApiVideoItem[];
}

/**
 * Parse ISO 8601 duration (e.g., "PT4M33S") to seconds.
 */
function parseDuration(iso: string): number {
  const match = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso);
  if (!match) return 0;
  const hours = Number.parseInt(match[1] || '0', 10);
  const minutes = Number.parseInt(match[2] || '0', 10);
  const seconds = Number.parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Get the best available thumbnail URL from YouTube API response.
 */
function getBestThumbnail(
  thumbnails: YouTubeApiSnippet['thumbnails']
): string | undefined {
  return (
    thumbnails.maxres?.url ??
    thumbnails.high?.url ??
    thumbnails.medium?.url ??
    thumbnails.default?.url
  );
}

/**
 * Fetch metadata for a YouTube video.
 * Returns null on any failure (network, quota, invalid ID).
 */
export async function fetchYouTubeMetadata(
  videoId: string
): Promise<MusicVideoMetadata | null> {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY;
  if (!apiKey) {
    console.warn('[youtube] YOUTUBE_DATA_API_KEY not configured');
    return null;
  }

  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('id', videoId);
    url.searchParams.set('part', 'snippet,contentDetails,liveStreamingDetails');
    url.searchParams.set('key', apiKey);

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.warn(`[youtube] API returned ${res.status} for video ${videoId}`);
      return null;
    }

    const data = (await res.json()) as YouTubeApiResponse;
    const item = data.items?.[0];
    if (!item) {
      console.warn(`[youtube] No video found for ID ${videoId}`);
      return null;
    }

    return {
      youtubeVideoId: videoId,
      youtubeThumbnailUrl: getBestThumbnail(item.snippet.thumbnails),
      youtubePremiereDate:
        item.liveStreamingDetails?.scheduledStartTime ?? undefined,
      youtubeChannelId: item.snippet.channelId,
      youtubeChannelName: item.snippet.channelTitle,
      duration: parseDuration(item.contentDetails.duration),
    };
  } catch (error) {
    console.warn(`[youtube] Failed to fetch metadata for ${videoId}:`, error);
    return null;
  }
}
