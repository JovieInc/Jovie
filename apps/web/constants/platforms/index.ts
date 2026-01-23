/**
 * @fileoverview Canonical Platform Registry - Single Source of Truth
 *
 * This module is the **SINGLE SOURCE OF TRUTH** for all social platform definitions
 * in the Jovie application.
 *
 * ## Exports Overview
 *
 * **Types:**
 * - `SocialPlatform` - Union type of all valid platform IDs
 * - `PlatformCategory` - Union type of all category names
 * - `PlatformMetadata` - Interface for platform metadata structure
 *
 * **Constants:**
 * - `ALL_PLATFORMS` - Complete readonly array of all platform metadata
 * - `SOCIAL_PLATFORMS` - Readonly array of just the platform IDs
 * - `PLATFORM_METADATA_MAP` - O(1) lookup map from ID to metadata
 * - `CATEGORY_LABELS` - Human-readable labels for each category
 * - `CATEGORY_ORDER` - Ordered array of categories for UI display
 *
 * **Functions:**
 * - `isValidPlatform(value)` - Type guard for validating platform IDs
 * - `getPlatformsByCategory()` - Get platforms grouped by category
 * - `getPlatformMetadata(id)` - Get metadata for a specific platform
 *
 * @module constants/platforms
 * @see {@link https://simpleicons.org/} for icon slugs
 */

// Categories
export { CATEGORY_LABELS, CATEGORY_ORDER } from './categories';

// Data
export { ALL_PLATFORMS } from './data';
// Derived constants
export type { SocialPlatform } from './derived';
export { PLATFORM_METADATA_MAP, SOCIAL_PLATFORMS } from './derived';
// Types
export type { PlatformCategory, PlatformMetadata } from './types';

// Utilities
export {
  getPlatformMetadata,
  getPlatformsByCategory,
  isValidPlatform,
} from './utils';
