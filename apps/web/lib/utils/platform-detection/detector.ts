/**
 * Platform Detector
 * Main detection logic, title generation, and canonical identity
 */

import { normalizeUrl } from './normalizer';
import { DOMAIN_PATTERNS, PLATFORMS } from './registry';
import type { DetectedLink, PlatformInfo } from './types';
import { getValidationError, validateUrl } from './validator';

/**
 * Generate title for Spotify links based on URL structure
 */
function getSpotifyTitle(url: string, platformName: string): string {
  if (url.includes('/artist/')) return `${platformName} Artist`;
  if (url.includes('/album/')) return `${platformName} Album`;
  if (url.includes('/track/')) return `${platformName} Track`;
  return platformName;
}

/**
 * Generate title for social media platforms with usernames
 */
function getSocialMediaTitle(
  parsedUrl: URL,
  platform: PlatformInfo,
  creatorName?: string
): string {
  const pathParts = parsedUrl.pathname.split('/').filter(s => s.length > 0);
  const username = pathParts[0]?.replace('@', '') || '';

  if (creatorName) {
    return `${creatorName} on ${platform.name}`;
  }

  if (username) {
    if (platform.id === 'tiktok') {
      return `${platform.name} (@${username})`;
    }
    return `@${username} on ${platform.name}`;
  }

  return platform.name;
}

/**
 * Generate a suggested title for the link
 * @param url The URL to generate a title for
 * @param platform The platform info
 * @param creatorName Optional creator's name to use in the title (e.g., "Tim White")
 */
function generateSuggestedTitle(
  url: string,
  platform: PlatformInfo,
  creatorName?: string
): string {
  try {
    const parsedUrl = new URL(url);

    // Platform-specific title generation
    switch (platform.id) {
      case 'spotify':
        return getSpotifyTitle(url, platform.name);

      case 'instagram':
      case 'twitter':
      case 'tiktok':
      case 'youtube':
      case 'facebook':
      case 'linkedin':
        return getSocialMediaTitle(parsedUrl, platform, creatorName);

      case 'youtube-channel':
        return creatorName ? `${creatorName} on YouTube` : 'YouTube Channel';

      default:
        return platform.name;
    }
  } catch {
    return platform.name;
  }
}

/**
 * Detect platform from URL and return normalized link info
 */
export function detectPlatform(
  url: string,
  creatorName?: string
): DetectedLink {
  const normalizedUrl = normalizeUrl(url);

  // Find matching platform
  let detectedPlatform: PlatformInfo | null = null;

  for (const { pattern, platformId } of DOMAIN_PATTERNS) {
    if (pattern.test(normalizedUrl)) {
      detectedPlatform = PLATFORMS[platformId];
      break;
    }
  }

  // Fallback to custom/website
  if (!detectedPlatform) {
    detectedPlatform = PLATFORMS.website;
  }

  // Generate suggested title
  const suggestedTitle = generateSuggestedTitle(
    normalizedUrl,
    detectedPlatform,
    creatorName
  );

  // Validate URL
  const isValid = validateUrl(normalizedUrl, detectedPlatform);

  return {
    platform: detectedPlatform,
    normalizedUrl,
    originalUrl: url,
    suggestedTitle,
    isValid,
    error: isValid ? undefined : getValidationError(detectedPlatform.id),
  };
}

/**
 * Extract identity for social platforms with username as first path segment.
 */
function getSocialPlatformIdentity(
  platformId: string,
  parts: string[]
): string | null {
  if (parts[0]) {
    return `${platformId}:${parts[0].replace(/^@/, '').toLowerCase()}`;
  }
  return null;
}

/**
 * Extract identity for YouTube with various URL formats.
 */
function getYouTubeIdentity(parts: string[]): string | null {
  if (parts[0]?.startsWith('@')) {
    return `youtube:${parts[0].slice(1).toLowerCase()}`;
  }
  if (parts[0] === 'channel' && parts[1]) {
    return `youtube:channel:${parts[1].toLowerCase()}`;
  }
  if (parts[0] === 'user' && parts[1]) {
    return `youtube:user:${parts[1].toLowerCase()}`;
  }
  if (parts.length === 1) {
    return `youtube:legacy:${parts[0].toLowerCase()}`;
  }
  return null;
}

/**
 * Extract identity for Thematic with artist/creator profile URLs.
 */
function getThematicIdentity(parts: string[]): string | null {
  const isValidFormat =
    parts.length >= 3 &&
    (parts[0] === 'artist' || parts[0] === 'creator') &&
    parts[1] === 'profile';

  if (isValidFormat) {
    return `thematic:${parts[0]}:${parts[2].toLowerCase()}`;
  }
  return null;
}

/**
 * Compute a canonical identity string used to detect duplicates across
 * small URL variations (missing dots, protocol, www, with/without @, etc.).
 * The identity is stable per platform + primary handle/ID where possible.
 */
export function canonicalIdentity(
  link: Pick<DetectedLink, 'platform' | 'normalizedUrl'>
): string {
  try {
    const u = new URL(link.normalizedUrl);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const parts = u.pathname.split('/').filter(Boolean);

    const platformId = link.platform.id;
    let identity: string | null = null;

    // Social platforms with username as first segment
    if (['instagram', 'twitter', 'tiktok'].includes(platformId)) {
      identity = getSocialPlatformIdentity(platformId, parts);
    }
    // YouTube with multiple URL formats
    else if (platformId === 'youtube') {
      identity = getYouTubeIdentity(parts);
    }
    // Simple platforms with username/handle as first segment
    else if (
      ['facebook', 'twitch', 'linkedin', 'soundcloud', 'bandcamp'].includes(
        platformId
      )
    ) {
      identity = getSocialPlatformIdentity(platformId, parts);
    }
    // Linktree
    else if (platformId === 'linktree' && parts[0]) {
      identity = `linktree:${parts[0].toLowerCase()}`;
    }
    // Thematic with artist/creator profiles
    else if (platformId === 'thematic') {
      identity = getThematicIdentity(parts);
    }

    // Return platform identity if found, otherwise fallback to host+path
    return identity ?? `${platformId}:${host}${u.pathname.toLowerCase()}`;
  } catch {
    // If parsing fails, fall back to normalized URL
    return `${link.platform.id}:${link.normalizedUrl.toLowerCase()}`;
  }
}
