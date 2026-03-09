/**
 * @fileoverview Canonical Platform Registry - Single Source of Truth
 *
 * This module is the **SINGLE SOURCE OF TRUTH** for all social platform definitions
 * in the Jovie application. It consolidates platform definitions that were previously
 * scattered across multiple files into one authoritative location.
 *
 * This file is a barrel export that re-exports from the modular
 * platforms directory for backwards compatibility.
 *
 * @module constants/platforms
 * @see {@link https://simpleicons.org/} for icon slugs
 */

export { CATEGORY_LABELS, CATEGORY_ORDER } from './platforms/categories';
export { ALL_PLATFORMS } from './platforms/data';
export type { SocialPlatform } from './platforms/derived';
export { PLATFORM_METADATA_MAP, SOCIAL_PLATFORMS } from './platforms/derived';
export type { PlatformCategory, PlatformMetadata } from './platforms/types';
export {
  getPlatformMetadata,
  getPlatformsByCategory,
  isValidPlatform,
} from './platforms/utils';
