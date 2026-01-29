/**
 * Base Extraction Utilities
 *
 * @deprecated This file is maintained for backwards compatibility.
 * Import from '@/lib/ingestion/strategies/base/' for new code.
 *
 * Provides common fetch, parsing, and error handling patterns
 * shared across all ingestion strategies.
 */

// Re-export everything from the modular structure for backwards compatibility
export {
  createExtractionResult,
  DEFAULT_MAX_RESPONSE_BYTES,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  decodeHtmlEntities,
  ExtractionError,
  type ExtractionErrorCode,
  extractHrefs,
  extractLinks,
  extractMetaContent,
  extractOpenGraphProfile,
  extractScriptJson,
  type FetchOptions,
  type FetchResult,
  fetchDocument,
  HREF_REGEX,
  isPlatformUrl,
  isUrlSafe,
  isValidHandle,
  type LinkExtractionOptions,
  MAX_REDIRECTS,
  normalizeHandle,
  type OpenGraphProfile,
  RETRY_DELAY_MS,
  type StrategyConfig,
  sleep,
  stripTrackingParams,
  TRACKING_HOSTS,
  TRACKING_PARAMS,
  UNSUPPORTED_SCHEMES,
  validatePlatformUrl,
} from './base/index';
