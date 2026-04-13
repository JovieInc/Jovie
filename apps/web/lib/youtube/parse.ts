/**
 * YouTube URL Parser
 *
 * Extracts video IDs from all common YouTube URL formats.
 * Pure function, no API calls.
 */

export interface ParsedYouTubeUrl {
  videoId: string;
  url: string;
}

const YOUTUBE_PATTERNS = [
  // youtube.com/watch?v=VIDEO_ID
  /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
  // youtu.be/VIDEO_ID
  /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  // youtube.com/embed/VIDEO_ID
  /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  // youtube.com/shorts/VIDEO_ID
  /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
];

/**
 * Parse a YouTube URL and extract the video ID.
 * Returns null for invalid or non-YouTube URLs.
 */
export function parseYouTubeUrl(url: string): ParsedYouTubeUrl | null {
  if (!url) return null;

  try {
    for (const pattern of YOUTUBE_PATTERNS) {
      const match = url.match(pattern);
      if (match?.[1]) {
        return { videoId: match[1], url };
      }
    }
  } catch {
    return null;
  }

  return null;
}
