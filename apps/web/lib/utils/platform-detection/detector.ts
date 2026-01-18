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
  const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
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

    switch (link.platform.id) {
      case 'instagram':
      case 'twitter':
      case 'tiktok':
        // x.com/twitter.com and tiktok.com; username is first segment
        if (parts[0])
          return `${link.platform.id}:${parts[0].replace(/^@/, '').toLowerCase()}`;
        break;
      case 'youtube':
        // Prefer @handle, else channel/ID, else legacy single segment
        if (parts[0]?.startsWith('@'))
          return `youtube:${parts[0].slice(1).toLowerCase()}`;
        if (parts[0] === 'channel' && parts[1])
          return `youtube:channel:${parts[1].toLowerCase()}`;
        if (parts[0] === 'user' && parts[1])
          return `youtube:user:${parts[1].toLowerCase()}`;
        if (parts.length === 1)
          return `youtube:legacy:${parts[0].toLowerCase()}`;
        break;
      case 'facebook':
      case 'twitch':
      case 'linkedin':
      case 'soundcloud':
      case 'bandcamp':
        if (parts[0]) return `${link.platform.id}:${parts[0].toLowerCase()}`;
        break;
      case 'linktree':
        if (parts[0]) return `linktree:${parts[0].toLowerCase()}`;
        break;
      case 'thematic':
        // Path format: /artist/profile/{id} or /creator/profile/{id}
        if (
          parts.length >= 3 &&
          (parts[0] === 'artist' || parts[0] === 'creator') &&
          parts[1] === 'profile'
        ) {
          return `thematic:${parts[0]}:${parts[2].toLowerCase()}`;
        }
        break;
      default:
        break;
    }

    // Fallback to host+path signature
    return `${link.platform.id}:${host}${u.pathname.toLowerCase()}`;
  } catch {
    // If parsing fails, fall back to normalized URL
    return `${link.platform.id}:${link.normalizedUrl.toLowerCase()}`;
  }
}
