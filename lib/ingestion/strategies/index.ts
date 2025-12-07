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

// ============================================================================
// Strategy Detection
// ============================================================================

import { isBeaconsUrl } from './beacons';
import { isLinktreeUrl } from './linktree';

export type IngestionPlatform = 'linktree' | 'beacons' | 'unknown';

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
  return 'unknown';
}

/**
 * Checks if a URL is supported for ingestion.
 */
export function isSupportedIngestionUrl(url: string): boolean {
  return detectIngestionPlatform(url) !== 'unknown';
}
