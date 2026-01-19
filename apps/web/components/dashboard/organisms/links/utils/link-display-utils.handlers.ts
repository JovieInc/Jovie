/**
 * Link Display URL Handlers
 *
 * Strategy-based handlers for formatting URLs by platform.
 * Extracted to reduce cognitive complexity of compactUrlDisplay.
 */

import { trimTrailingSlashes } from '@/lib/utils/string-utils';

/**
 * Parsed URL data structure
 */
export interface ParsedUrlData {
  host: string;
  segments: string[];
  first: string;
  second: string;
}

/**
 * Platform display handler interface
 */
export interface PlatformDisplayHandler {
  match: (platformId: string) => boolean;
  format: (data: ParsedUrlData) => string;
}

/**
 * Safely parse a URL, returning null on failure
 */
export function parseUrlSafe(url: string): ParsedUrlData | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const withScheme = ensureHttpsScheme(trimmed);

  try {
    const parsed = new URL(withScheme);
    const host = parsed.hostname.replace(/^www\./, '');
    const path = trimTrailingSlashes(parsed.pathname);
    const segments = path.split('/').filter(Boolean);

    return {
      host,
      segments,
      first: segments[0] ?? '',
      second: segments[1] ?? '',
    };
  } catch {
    return null;
  }
}

/**
 * Ensure a URL has an https:// scheme
 */
export function ensureHttpsScheme(url: string): string {
  const lower = url.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    return url;
  }
  return `https://${url}`;
}

/**
 * Format a value as a handle with @ prefix
 */
export function formatAsHandle(value: string): string {
  return value.startsWith('@') ? value : `@${value}`;
}

/**
 * Strip URL scheme for fallback display
 */
export function stripUrlScheme(url: string): string {
  const lower = url.toLowerCase();
  const withoutScheme = lower.startsWith('https://')
    ? url.slice(8)
    : lower.startsWith('http://')
      ? url.slice(7)
      : url;
  const beforePath = withoutScheme.split('/')[0];
  return beforePath || url;
}

/**
 * Platform display handlers using strategy pattern
 */
export const PLATFORM_DISPLAY_HANDLERS: PlatformDisplayHandler[] = [
  // TikTok: @username format
  {
    match: id => id === 'tiktok',
    format: ({ host, first }) => {
      if (!first) return host;
      return formatAsHandle(first);
    },
  },

  // Instagram, Twitter/X, Venmo: @username format
  {
    match: id => ['instagram', 'twitter', 'x', 'venmo'].includes(id),
    format: ({ host, first }) => {
      if (!first) return host;
      return formatAsHandle(first);
    },
  },

  // Snapchat: handle /add/username or just /username
  {
    match: id => id === 'snapchat',
    format: ({ host, first, second }) => {
      if (!first) return host;
      if (first === 'add' && second) return formatAsHandle(second);
      return formatAsHandle(first);
    },
  },

  // YouTube: @handle, /channel/ID, /c/name, /user/name
  {
    match: id => id === 'youtube',
    format: ({ host, first, second }) => {
      if (first.startsWith('@')) return first;
      if (['channel', 'c', 'user'].includes(first) && second) {
        return formatAsHandle(second);
      }
      return first || host;
    },
  },

  // Website: just show host
  {
    match: id => id === 'website',
    format: ({ host }) => host,
  },
];

/**
 * Find a handler for the given platform ID
 */
export function findPlatformHandler(
  platformId: string
): PlatformDisplayHandler | undefined {
  return PLATFORM_DISPLAY_HANDLERS.find(h => h.match(platformId));
}
