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
// Feature.fm strategy (music smart links)
export {
  extractFeatureFm,
  extractFeatureFmId,
  fetchFeatureFmDocument,
  isFeatureFmUrl,
  validateFeatureFmUrl,
} from './featurefm';
// Laylo strategy
export {
  extractLaylo,
  extractLayloHandle,
  fetchLayloProfile,
  isLayloUrl,
  normalizeLayloHandle,
  validateLayloUrl,
} from './laylo';
// Linkfire strategy (music smart links)
export {
  extractLinkfire,
  extractLinkfireId,
  fetchLinkfireDocument,
  isLinkfireUrl,
  validateLinkfireUrl,
} from './linkfire';
// Linktree strategy
export {
  extractLinktree,
  extractLinktreeHandle,
  fetchLinktreeDocument,
  isLinktreeUrl,
  isValidHandle as isValidLinktreeHandle,
  normalizeHandle as normalizeLinktreeHandle,
  validateLinktreeUrl,
} from './linktree';
// ToneDen strategy (music smart links)
export {
  extractToneDen,
  extractToneDenId,
  fetchToneDenDocument,
  isToneDenUrl,
  validateToneDenUrl,
} from './toneden';
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
import { isFeatureFmUrl } from './featurefm';
import { isLayloUrl } from './laylo';
import { isLinkfireUrl } from './linkfire';
import { isLinktreeUrl } from './linktree';
import { isToneDenUrl } from './toneden';
import { isYouTubeChannelUrl } from './youtube';

export type IngestionPlatform =
  | 'linktree'
  | 'beacons'
  | 'laylo'
  | 'youtube'
  | 'linkfire'
  | 'featurefm'
  | 'toneden'
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
  if (isYouTubeChannelUrl(url)) {
    return 'youtube';
  }
  if (isLinkfireUrl(url)) {
    return 'linkfire';
  }
  if (isFeatureFmUrl(url)) {
    return 'featurefm';
  }
  if (isToneDenUrl(url)) {
    return 'toneden';
  }
  return 'unknown';
}

/**
 * Checks if a URL is supported for ingestion.
 */
export function isSupportedIngestionUrl(url: string): boolean {
  return detectIngestionPlatform(url) !== 'unknown';
}
