/**
 * Ingestion Strategies Index
 *
 * Exports all platform-specific ingestion strategies and shared utilities.
 */

// Base utilities
export {
  createExtractionResult,
  decodeHtmlEntities,
  ExtractionError,
  type ExtractionErrorCode,
  extractLinks,
  extractMetaContent,
  type FetchOptions,
  type FetchResult,
  fetchDocument,
  isValidHandle,
  normalizeHandle,
  type StrategyConfig,
  stripTrackingParams,
  validatePlatformUrl,
} from './base';
// Beacons strategy
export {
  extractBeacons,
  extractBeaconsHandle,
  fetchBeaconsDocument,
  isBeaconsUrl,
  isValidHandle as isValidBeaconsHandle,
  normalizeHandle as normalizeBeaconsHandle,
  validateBeaconsUrl,
} from './beacons';
// Instagram strategy
export {
  extractInstagram,
  extractInstagramHandle,
  isInstagramUrl,
  validateInstagramUrl,
} from './instagram';
// Laylo strategy
export {
  extractLaylo,
  extractLayloHandle,
  fetchLayloProfile,
  isLayloUrl,
  normalizeLayloHandle,
  validateLayloUrl,
} from './laylo';
// Linktree strategy
export {
  extractLinktree,
  extractLinktreeHandle,
  isLinktreeUrl,
  isValidHandle as isValidLinktreeHandle,
  normalizeHandle as normalizeLinktreeHandle,
  validateLinktreeUrl,
} from './linktree';
// TikTok strategy
export {
  extractTikTok,
  extractTikTokHandle,
  fetchTikTokDocument,
  isTikTokUrl,
  validateTikTokUrl,
} from './tiktok';
// Twitter strategy
export {
  extractTwitter,
  extractTwitterHandle,
  fetchTwitterDocument,
  isTwitterUrl,
  validateTwitterUrl,
} from './twitter';
// YouTube strategy
export {
  extractYouTube,
  extractYouTubeHandle,
  fetchYouTubeAboutDocument,
  isYouTubeChannelUrl,
  validateYouTubeChannelUrl,
} from './youtube';

// ============================================================================
// Strategy Detection
// ============================================================================

import { isBeaconsUrl } from './beacons';
import { isInstagramUrl } from './instagram';
import { isLayloUrl } from './laylo';
import { isLinktreeUrl } from './linktree';
import { isTikTokUrl } from './tiktok';
import { isTwitterUrl } from './twitter';
import { isYouTubeChannelUrl } from './youtube';

/** Detection vocabulary, not a claim that remote profile reads are available. */
export const INGESTION_PLATFORM_IDS = [
  'beacons',
  'instagram',
  'laylo',
  'linktree',
  'tiktok',
  'twitter',
  'youtube',
] as const;
export type IngestionPlatform =
  | (typeof INGESTION_PLATFORM_IDS)[number]
  | 'unknown';

/**
 * Detects which ingestion platform a URL belongs to.
 *
 * Policy note: Twitch and OnlyFans are intentionally excluded here. We
 * support detection/normalization for those platforms, but ingestion/scraping
 * remains disallowed by default (see docs/network-support-matrix.md).
 */
export function detectIngestionPlatform(url: string): IngestionPlatform {
  if (isLinktreeUrl(url)) {
    return 'linktree';
  }
  if (isBeaconsUrl(url)) {
    return 'beacons';
  }
  if (isLayloUrl(url)) {
    return 'laylo';
  }
  if (isInstagramUrl(url)) {
    return 'instagram';
  }
  if (isTikTokUrl(url)) {
    return 'tiktok';
  }
  if (isTwitterUrl(url)) {
    return 'twitter';
  }
  if (isYouTubeChannelUrl(url)) {
    return 'youtube';
  }
  return 'unknown';
}

/**
 * Checks if a URL is supported for ingestion.
 */
export function isSupportedIngestionUrl(url: string): boolean {
  const platform = detectIngestionPlatform(url);
  return !['unknown', 'linktree', 'instagram'].includes(platform);
}
