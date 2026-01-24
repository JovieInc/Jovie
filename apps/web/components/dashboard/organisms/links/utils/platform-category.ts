/**
 * Platform Category Utilities
 *
 * Functions for categorizing platforms and determining platform types.
 */

import { DSP_PLATFORMS } from '@/lib/services/social-links/types';
import type { PlatformType } from '../types';

/**
 * Set of DSP (Digital Service Provider) platforms
 * Uses canonical source from social-links/types for consistency
 */
const DSP_PLATFORMS_SET = new Set<string>(DSP_PLATFORMS);

/**
 * Set of website/link-in-bio platforms
 */
const WEBSITE_PLATFORMS = new Set(['website', 'linktree', 'laylo', 'beacons']);

/**
 * Set of earnings/monetization platforms
 */
const EARNINGS_PLATFORMS = new Set([
  'patreon',
  'buy_me_a_coffee',
  'kofi',
  'paypal',
  'venmo',
  'cashapp',
  'shopify',
  'etsy',
  'amazon',
]);

/**
 * Set of social media platforms
 */
const SOCIAL_PLATFORMS = new Set([
  'instagram',
  'twitter',
  'snapchat',
  'tiktok',
  'youtube',
  'facebook',
  'twitch',
]);

/**
 * Get the platform category for a given platform ID
 *
 * @param platform - The platform ID to categorize
 * @returns The platform type category
 */
export function getPlatformCategory(platform: string): PlatformType {
  if (DSP_PLATFORMS_SET.has(platform)) return 'dsp';
  if (EARNINGS_PLATFORMS.has(platform)) return 'earnings';
  if (SOCIAL_PLATFORMS.has(platform)) return 'social';
  if (WEBSITE_PLATFORMS.has(platform)) return 'websites';
  return 'custom';
}

/**
 * Get the hostname from a URL string
 *
 * @param value - The URL to parse
 * @returns The hostname without 'www.' prefix, or null if invalid
 */
export function getHostnameForUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Check if a URL can be ingested for link suggestions
 *
 * These are URLs that Jovie can crawl to find additional links.
 *
 * @param value - The URL to check
 * @returns True if the URL is ingestable
 */
export function isIngestableUrl(value: string): boolean {
  const hostname = getHostnameForUrl(value);
  if (!hostname) return false;

  if (hostname === 'youtu.be') return true;
  if (hostname === 'linktr.ee') return true;
  if (hostname === 'laylo.com') return true;
  if (hostname === 'beacons.ai') return true;

  if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com')) {
    return true;
  }

  return false;
}
