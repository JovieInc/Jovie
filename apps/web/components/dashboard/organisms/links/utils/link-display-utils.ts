/**
 * Link Display Utilities
 *
 * Pure utility functions for formatting and displaying link information.
 * These functions have no React dependencies and can be used anywhere.
 */

import {
  canonicalIdentity,
  type DetectedLink,
} from '@/lib/utils/platform-detection';
import {
  findPlatformHandler,
  parseUrlSafe,
  stripUrlScheme,
} from './link-display-utils.handlers';

/**
 * Link section types for categorizing links in the UI
 */
export type LinkSection = 'social' | 'dsp' | 'earnings' | 'custom';

/**
 * Get a human-readable display label for a link section
 *
 * @param section - The link section type
 * @returns Display label for the section
 */
export function labelFor(section: LinkSection): string {
  switch (section) {
    case 'social':
      return 'Social';
    case 'dsp':
      return 'Music service';
    case 'earnings':
      return 'Monetization';
    default:
      return 'Custom';
  }
}

/**
 * Format a URL for compact display based on the platform
 *
 * Extracts the most relevant identifier from a URL (usually a username/handle)
 * and formats it appropriately for the platform (e.g., @username for social platforms)
 *
 * @param platformId - The platform identifier (e.g., 'instagram', 'youtube')
 * @param url - The URL to format
 * @returns A compact display string (e.g., '@username' or 'hostname')
 */
export function compactUrlDisplay(platformId: string, url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';

  const urlData = parseUrlSafe(trimmed);
  if (!urlData) return stripUrlScheme(trimmed);

  const handler = findPlatformHandler(platformId);
  return handler ? handler.format(urlData) : urlData.host;
}

/**
 * Extract the @-prefixed identity from a link if available
 *
 * Uses canonicalIdentity to determine if the link has an @-style identifier
 *
 * @param link - A link object with platform and normalizedUrl
 * @returns The @-prefixed identity string or undefined if not available
 */
export function suggestionIdentity(
  link: Pick<DetectedLink, 'platform' | 'normalizedUrl'>
): string | undefined {
  const identity = canonicalIdentity(link);
  const [platformId, ...rest] = identity.split(':');

  if (platformId === 'youtube') {
    const handle = rest.length === 1 ? rest[0] : undefined;
    return handle ? `@${handle}` : undefined;
  }

  const handlePlatforms = new Set([
    'instagram',
    'twitter',
    'x',
    'tiktok',
    'venmo',
  ]);
  if (handlePlatforms.has(platformId)) {
    const handle = rest[0];
    return handle ? `@${handle}` : undefined;
  }

  return undefined;
}

/**
 * Build a prefill URL for quick-add suggestions
 *
 * Given a platform ID, returns a partial URL that can be used to prefill
 * the link input for that platform. Special case: 'spotify-artist' returns
 * a search mode trigger.
 *
 * @param platformId - The platform identifier
 * @returns A prefill URL string for the platform
 */
export function buildPrefillUrl(platformId: string): string {
  switch (platformId) {
    case 'spotify-artist':
      // Special case: triggers search mode in UniversalLinkInput
      return '__SEARCH_MODE__:spotify';
    case 'spotify':
      return 'https://open.spotify.com/artist/';
    case 'apple-music':
      return 'https://music.apple.com/artist/';
    case 'youtube-music':
      return 'https://music.youtube.com/channel/';
    case 'instagram':
      return 'https://instagram.com/';
    case 'tiktok':
      return 'https://www.tiktok.com/@';
    case 'youtube':
      return 'https://www.youtube.com/@';
    case 'twitter':
      return 'https://x.com/';
    case 'venmo':
      return 'https://venmo.com/';
    case 'website':
      return 'https://';
    default:
      return '';
  }
}
