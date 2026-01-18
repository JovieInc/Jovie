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
import { trimTrailingSlashes } from '@/lib/utils/string-utils';

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
      return 'SOCIAL';
    case 'dsp':
      return 'MUSIC SERVICE';
    case 'earnings':
      return 'MONETIZATION';
    default:
      return 'CUSTOM';
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

  const withScheme = (() => {
    if (
      trimmed.toLowerCase().startsWith('http://') ||
      trimmed.toLowerCase().startsWith('https://')
    ) {
      return trimmed;
    }
    return `https://${trimmed}`;
  })();

  try {
    const parsed = new URL(withScheme);
    const host = parsed.hostname.replace(/^www\./, '');
    const path = trimTrailingSlashes(parsed.pathname);
    const segments = path.split('/').filter(Boolean);
    const first = segments[0] ?? '';
    const second = segments[1] ?? '';

    const atOr = (value: string): string =>
      value.startsWith('@') ? value : `@${value}`;

    if (platformId === 'tiktok') {
      if (!first) return host;
      return first.startsWith('@') ? first : atOr(first);
    }

    if (
      platformId === 'instagram' ||
      platformId === 'twitter' ||
      platformId === 'x' ||
      platformId === 'venmo'
    ) {
      if (!first) return host;
      return first.startsWith('@') ? first : atOr(first);
    }

    if (platformId === 'snapchat') {
      if (!first) return host;
      if (first === 'add' && second) return atOr(second);
      return first.startsWith('@') ? first : atOr(first);
    }

    if (platformId === 'youtube') {
      if (first.startsWith('@')) return first;
      if (
        (first === 'channel' || first === 'c' || first === 'user') &&
        second
      ) {
        return atOr(second);
      }
      return first ? first : host;
    }

    if (platformId === 'website') {
      return host;
    }

    return host;
  } catch {
    const lowered = trimmed.toLowerCase();
    const withoutScheme = lowered.startsWith('https://')
      ? trimmed.slice(8)
      : lowered.startsWith('http://')
        ? trimmed.slice(7)
        : trimmed;
    const beforePath = withoutScheme.split('/')[0];
    return beforePath || trimmed;
  }
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
