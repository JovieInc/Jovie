/**
 * Centralized Cache Tags Definition
 *
 * This file defines all cache tags used throughout the application.
 * Using centralized tags ensures consistency and makes it easier to
 * invalidate related caches when data changes.
 *
 * @module lib/cache/tags
 *
 * ## Usage
 *
 * ```ts
 * import { CACHE_TAGS, createProfileTag } from '@/lib/cache/tags';
 *
 * // Use predefined tags
 * revalidateTag(CACHE_TAGS.PUBLIC_PROFILE);
 *
 * // Use helper functions for parameterized tags
 * revalidateTag(createProfileTag('johndoe'));
 * ```
 *
 * ## Adding New Tags
 *
 * 1. Add the tag constant to CACHE_TAGS
 * 2. If the tag is parameterized, add a helper function
 * 3. Update CACHING_DECISIONS.md with the new tag's scope and usage
 */

/**
 * All cache tag constants used in the application.
 * These are used with Next.js `revalidateTag()` and `unstable_cache`.
 */
export const CACHE_TAGS = {
  // Public profile caches
  PUBLIC_PROFILE: 'profiles-all',

  // Dashboard data caches
  DASHBOARD_DATA: 'dashboard-data',

  // Featured creators list
  FEATURED_CREATORS: 'featured-creators',

  // Billing/subscription data
  BILLING_DATA: 'billing-data',
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];

/**
 * Create a username-specific profile cache tag.
 * Used for targeted invalidation of individual profile pages.
 *
 * @param usernameNormalized - The normalized (lowercase) username
 * @returns The cache tag string
 *
 * @example
 * ```ts
 * // Tag a profile cache
 * unstable_cache(fetchProfile, [createProfileTag('johndoe')]);
 *
 * // Invalidate specific profile
 * revalidateTag(createProfileTag('johndoe'));
 * ```
 */
export function createProfileTag(usernameNormalized: string): string {
  return `profile:${usernameNormalized}`;
}

/**
 * Create a profile-specific social links cache tag.
 * Used for targeted invalidation when social links change.
 *
 * @param profileId - The profile UUID
 * @returns The cache tag string
 */
export function createSocialLinksTag(profileId: string): string {
  return `social-links:${profileId}`;
}

/**
 * Create a user-specific avatar cache tag.
 * Used for targeted invalidation when avatar changes.
 *
 * @param userId - The user UUID or clerk ID
 * @returns The cache tag string
 */
export function createAvatarTag(userId: string): string {
  return `avatar:${userId}`;
}

/**
 * Cache TTL presets in seconds.
 * Use these for consistent cache durations across the app.
 */
export const CACHE_TTL = {
  /** Very short cache for frequently changing data (5 seconds) */
  INSTANT: 5,

  /** Short cache for user-specific data that needs freshness (1 minute) */
  SHORT: 60,

  /** Medium cache for semi-static data (5 minutes) */
  MEDIUM: 5 * 60,

  /** Long cache for rarely changing data (1 hour) */
  LONG: 60 * 60,

  /** Very long cache for static data (24 hours) */
  DAY: 24 * 60 * 60,

  /** Weekly cache for very static data (7 days) */
  WEEK: 7 * 24 * 60 * 60,
} as const;

export type CacheTTL = (typeof CACHE_TTL)[keyof typeof CACHE_TTL];
