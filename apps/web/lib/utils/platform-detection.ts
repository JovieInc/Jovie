/**
 * Platform Detection and Link Normalization Service
 * Atomic utility for identifying and normalizing social/music platform links
 *
 * This file re-exports from the platform-detection module for backwards compatibility.
 * New code should import from '@/lib/utils/platform-detection' directly.
 */

export {
  // Detector
  canonicalIdentity,
  // Types
  type DetectedLink,
  type DetectionCategory,
  // Registry
  DOMAIN_MISSPELLINGS,
  DOMAIN_PATTERNS,
  detectPlatform,
  // Environment
  getBaseUrl,
  // Link utilities
  getLinkVisibility,
  getPlatform,
  getPlatformsByCategory,
  // Validator
  getValidationError,
  hasManagedMetadata,
  isDevelopment,
  isDSPPlatform,
  isPreview,
  isProduction,
  isSocialPlatform,
  // Normalizer
  isUnsafeUrl,
  type ManagedLink,
  normalizeUrl,
  PLATFORM_ERROR_EXAMPLES,
  PLATFORMS,
  type PlatformInfo,
  validateUrl,
} from './platform-detection/index';
