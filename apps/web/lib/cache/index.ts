/**
 * Centralized Cache Module
 *
 * This module provides all caching utilities, tag definitions, and
 * invalidation functions for the application.
 *
 * ## Quick Start
 *
 * ```ts
 * import {
 *   CACHE_TAGS,
 *   CACHE_TTL,
 *   createProfileTag,
 *   invalidateProfileCache,
 *   invalidateSocialLinksCache,
 *   invalidateAvatarCache,
 * } from '@/lib/cache';
 * ```
 *
 * ## Cache Invalidation Guide
 *
 * | Mutation Type              | Function to Call             |
 * |---------------------------|------------------------------|
 * | Profile update            | `invalidateProfileCache()`   |
 * | Username change           | `invalidateUsernameChange()` |
 * | Social links add/update   | `invalidateSocialLinksCache()` |
 * | Avatar upload             | `invalidateAvatarCache()`    |
 *
 * @module lib/cache
 */

// Cache invalidation functions
export {
  invalidateAvatarCache,
  invalidateProfileCache,
  invalidateSocialLinksCache,
  invalidateUsernameChange,
} from './profile';

// Cache tags and constants
export {
  CACHE_TAGS,
  CACHE_TTL,
  type CacheTag,
  type CacheTTL,
  createAvatarTag,
  createProfileTag,
  createSocialLinksTag,
} from './tags';
