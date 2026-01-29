/**
 * Base Extraction Module
 *
 * Shared utilities for all ingestion strategies including:
 * - Document fetching with timeout and retries
 * - HTML parsing and link extraction
 * - URL validation and normalization
 */

// Constants
export {
  DEFAULT_MAX_RESPONSE_BYTES,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  HREF_REGEX,
  MAX_REDIRECTS,
  RETRY_DELAY_MS,
  TRACKING_HOSTS,
  TRACKING_PARAMS,
  UNSUPPORTED_SCHEMES,
} from './constants';
// Fetch
export { fetchDocument } from './fetch';
// Handle Extraction
export {
  buildCanonicalUrl,
  extractHandle,
  type HandleExtractionResult,
} from './handle-extractor';
// Host Validation
export {
  isCanonicalHostValid,
  isValidHost,
} from './host-validator';
// Parsing
export {
  extractHrefs,
  extractLinks,
  extractMetaContent,
  extractOpenGraphProfile,
  extractScriptJson,
  stripTrackingParams,
  type OpenGraphProfile,
} from './parsing';
// Result
export { createExtractionResult } from './result';
// Types
export {
  ExtractionError,
  type ExtractionErrorCode,
  type FetchOptions,
  type FetchResult,
  type LinkExtractionOptions,
  type StrategyConfig,
} from './types';
// Utilities
export {
  decodeHtmlEntities,
  isValidHandle,
  normalizeHandle,
  sleep,
} from './utils';
// Validation
export { isPlatformUrl, isUrlSafe, validatePlatformUrl } from './validation';
// Validation Pipeline (modular validators)
export {
  isUrlSafe as checkUrlSafety,
  type ValidationResult,
  validateHttpsProtocol,
  validateNotProtocolRelative,
  validateScheme,
  validateUrlSafety,
} from './validation-pipeline';
