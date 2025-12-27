/**
 * Platform Detection and Link Normalization Service
 * Atomic utility for identifying and normalizing social/music platform links
 *
 * This module re-exports all platform detection functionality for backwards compatibility.
 */

// Detector - Platform detection and identity
export { canonicalIdentity, detectPlatform } from './detector';
// Environment - Environment detection helpers
export {
  getBaseUrl,
  isDevelopment,
  isPreview,
  isProduction,
} from './environment';

// Normalizer - URL normalization
export { isUnsafeUrl, normalizeUrl } from './normalizer';
// Registry - Platform configurations and helpers
export {
  DOMAIN_MISSPELLINGS,
  DOMAIN_PATTERNS,
  getPlatform,
  getPlatformsByCategory,
  isDSPPlatform,
  isSocialPlatform,
  PLATFORMS,
} from './registry';
// Types
export type { DetectedLink, DetectionCategory, PlatformInfo } from './types';
// Validator - URL validation
export {
  getValidationError,
  PLATFORM_ERROR_EXAMPLES,
  validateUrl,
} from './validator';
