/**
 * Platform Derived Constants
 *
 * Constants derived from the ALL_PLATFORMS array.
 */

import { ALL_PLATFORMS } from './data';
import type { PlatformMetadata } from './types';

/**
 * Union type representing all valid social platform identifiers.
 *
 * Derived automatically from the ALL_PLATFORMS array for type safety.
 * TypeScript will enforce that only valid platform IDs are used.
 */
export type SocialPlatform = (typeof ALL_PLATFORMS)[number]['id'];

/**
 * Readonly array of all valid social platform identifiers.
 *
 * Use this for:
 * - Iterating over all platforms in UI components
 * - Populating dropdown/select options
 * - Validation in schemas (e.g., Zod, Yup)
 */
export const SOCIAL_PLATFORMS = ALL_PLATFORMS.map(
  p => p.id
) as readonly SocialPlatform[];

/**
 * Map of platform ID to metadata for O(1) lookups.
 *
 * Use this when you need to quickly access platform metadata by ID.
 */
export const PLATFORM_METADATA_MAP: Readonly<Record<string, PlatformMetadata>> =
  ALL_PLATFORMS.reduce(
    (acc, platform) => {
      acc[platform.id] = platform;
      return acc;
    },
    {} as Record<string, PlatformMetadata>
  );
