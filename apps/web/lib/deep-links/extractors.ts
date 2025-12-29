/**
 * URL extractors for social platforms and music services.
 * Reusable functions to extract usernames/IDs from URLs.
 */

/**
 * Extract Instagram username from URL
 */
export function extractInstagramUsername(url: string): string | null {
  const match = url.match(/instagram\.com\/([^/?#]+)/);
  return match ? match[1] : null;
}

/**
 * Extract TikTok username from URL
 */
export function extractTikTokUsername(url: string): string | null {
  const match = url.match(/tiktok\.com\/@([^/?#]+)/);
  return match ? match[1] : null;
}

/**
 * Extract Twitter/X username from URL
 */
export function extractTwitterUsername(url: string): string | null {
  const match = url.match(/(?:twitter|x)\.com\/([^/?#]+)/);
  return match ? match[1] : null;
}

/**
 * Extract YouTube username or channel from URL
 * Handles @username, /user/, and /channel/ formats
 */
export function extractYouTubeUsername(url: string): string | null {
  const usernameMatch = url.match(/youtube\.com\/@([^/?#]+)/);
  if (usernameMatch) return usernameMatch[1];

  const userMatch = url.match(/youtube\.com\/user\/([^/?#]+)/);
  if (userMatch) return userMatch[1];

  const channelMatch = url.match(/youtube\.com\/channel\/([^/?#]+)/);
  if (channelMatch) return channelMatch[1];

  return null;
}

/**
 * Extract YouTube channel ID from URL
 */
export function extractYouTubeChannelId(url: string): string | null {
  const match = url.match(/youtube\.com\/channel\/([^/?#]+)/);
  return match ? match[1] : null;
}

/**
 * Extract Facebook username from URL
 */
export function extractFacebookUsername(url: string): string | null {
  const match = url.match(/facebook\.com\/([^/?#]+)/);
  return match ? match[1] : null;
}

/**
 * Extract Spotify artist ID from URL
 */
export function extractSpotifyArtistId(url: string): string | null {
  const match = url.match(/spotify\.com\/artist\/([^/?#]+)/);
  return match ? match[1] : null;
}

/**
 * Extract Apple Music artist ID from URL
 */
export function extractAppleMusicArtistId(url: string): string | null {
  const match = url.match(/music\.apple\.com\/[^/]+\/artist\/[^/]+\/([^/?#]+)/);
  return match ? match[1] : null;
}

/**
 * Extract YouTube Music channel ID from URL
 */
export function extractYouTubeMusicChannelId(url: string): string | null {
  const match = url.match(/music\.youtube\.com\/channel\/([^/?#]+)/);
  return match ? match[1] : null;
}
