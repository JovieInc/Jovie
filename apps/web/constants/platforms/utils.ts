/**
 * Platform Utilities
 *
 * Helper functions for working with the platform registry.
 */

import { CATEGORY_ORDER } from './categories';
import { ALL_PLATFORMS } from './data';
import type { SocialPlatform } from './derived';
import { PLATFORM_METADATA_MAP } from './derived';
import type { PlatformCategory, PlatformMetadata } from './types';

/**
 * Type guard to check if a value is a valid social platform identifier.
 *
 * Useful for validating user input, external data, or narrowing types.
 * Uses O(1) lookup against PLATFORM_METADATA_MAP.
 *
 * @param value - The value to check (any type accepted)
 * @returns `true` if the value is a valid SocialPlatform, `false` otherwise
 */
export function isValidPlatform(value: unknown): value is SocialPlatform {
  return typeof value === 'string' && value in PLATFORM_METADATA_MAP;
}

/**
 * Get all platforms grouped by category.
 *
 * Returns a readonly record mapping each category to its platforms array.
 * Categories are guaranteed to exist even if empty.
 *
 * @returns Readonly record of category to array of platform metadata
 */
export function getPlatformsByCategory(): Readonly<
  Record<PlatformCategory, readonly PlatformMetadata[]>
> {
  const grouped = {} as Record<PlatformCategory, PlatformMetadata[]>;

  // Initialize all categories with empty arrays
  for (const category of CATEGORY_ORDER) {
    grouped[category] = [];
  }

  // Group platforms by category
  for (const platform of ALL_PLATFORMS) {
    grouped[platform.category].push(platform);
  }

  return grouped;
}

/**
 * Get metadata for a specific platform by ID.
 *
 * Returns `undefined` if the platform ID is not found.
 * Uses O(1) lookup against PLATFORM_METADATA_MAP.
 *
 * @param id - The platform identifier to look up
 * @returns Platform metadata object or `undefined` if not found
 */
export function getPlatformMetadata(id: string): PlatformMetadata | undefined {
  return PLATFORM_METADATA_MAP[id];
}
