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
  fetchLinktreeDocument,
  isLinktreeUrl,
  isValidHandle as isValidLinktreeHandle,
  normalizeHandle as normalizeLinktreeHandle,
  validateLinktreeUrl,
} from './linktree';
// Stan strategy
export {
  extractStan,
  extractStanHandle,
  fetchStanDocument,
  isStanUrl,
  normalizeStanHandle,
  validateStanUrl,
} from './stan';
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
import { isLayloUrl } from './laylo';
import { isLinktreeUrl } from './linktree';
import { isStanUrl } from './stan';
import { isYouTubeChannelUrl } from './youtube';

export type IngestionPlatform =
  | 'linktree'
  | 'beacons'
  | 'laylo'
  | 'stan'
  | 'youtube'
  | 'unknown';

/**
 * Detects which ingestion platform a URL belongs to.
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
  if (isStanUrl(url)) {
    return 'stan';
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
  return detectIngestionPlatform(url) !== 'unknown';
}
