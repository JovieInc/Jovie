/**
 * Profile Service Queries
 *
 * Centralized profile data access layer.
 * This is the single source of truth for profile queries.
 */

import { and, eq, ne } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  type CreatorContact,
  creatorContacts,
  creatorProfiles,
  socialLinks,
  users,
} from '@/lib/db/schema';
import { getLatestReleaseByUsername } from '@/lib/discography/queries';
import { captureWarning } from '@/lib/error-tracking';
import { getRedis } from '@/lib/redis';
import { toISOStringSafe } from '@/lib/utils/date';
import type {
  ProfileData,
  ProfileSocialLink,
  ProfileSummary,
  ProfileWithLinks,
  ProfileWithUser,
} from './types';

// Bounded data retrieval limits to prevent OOM on profiles with many links
const MAX_SOCIAL_LINKS = 100;
const MAX_CONTACTS = 50;

// Redis edge cache settings
const PROFILE_CACHE_KEY_PREFIX = 'profile:data:';
const PROFILE_CACHE_TTL_SECONDS = 300; // 5 minutes - short TTL for freshness

// Query timeout for public profile pages (fail fast for user-facing pages)
const PUBLIC_PROFILE_QUERY_TIMEOUT_MS = 5000; // 5 seconds

/**
 * Get a profile by its ID.
 *
 * @param profileId - The profile ID
 * @returns Profile data or null if not found
 */
export async function getProfileById(
  profileId: string
): Promise<ProfileData | null> {
  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      userId: creatorProfiles.userId,
      creatorType: creatorProfiles.creatorType,
      username: creatorProfiles.username,
      usernameNormalized: creatorProfiles.usernameNormalized,
      displayName: creatorProfiles.displayName,
      bio: creatorProfiles.bio,
      avatarUrl: creatorProfiles.avatarUrl,
      spotifyUrl: creatorProfiles.spotifyUrl,
      appleMusicUrl: creatorProfiles.appleMusicUrl,
      youtubeUrl: creatorProfiles.youtubeUrl,
      spotifyId: creatorProfiles.spotifyId,
      isPublic: creatorProfiles.isPublic,
      isVerified: creatorProfiles.isVerified,
      isClaimed: creatorProfiles.isClaimed,
      isFeatured: creatorProfiles.isFeatured,
      marketingOptOut: creatorProfiles.marketingOptOut,
      settings: creatorProfiles.settings,
      theme: creatorProfiles.theme,
      profileViews: creatorProfiles.profileViews,
      genres: creatorProfiles.genres,
      spotifyPopularity: creatorProfiles.spotifyPopularity,
      createdAt: creatorProfiles.createdAt,
      updatedAt: creatorProfiles.updatedAt,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);

  return profile ?? null;
}

/**
 * Get a profile by username (normalized).
 *
 * @param username - The username to look up
 * @returns Profile data or null if not found
 */
export async function getProfileByUsername(
  username: string
): Promise<ProfileData | null> {
  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      userId: creatorProfiles.userId,
      creatorType: creatorProfiles.creatorType,
      username: creatorProfiles.username,
      usernameNormalized: creatorProfiles.usernameNormalized,
      displayName: creatorProfiles.displayName,
      bio: creatorProfiles.bio,
      avatarUrl: creatorProfiles.avatarUrl,
      spotifyUrl: creatorProfiles.spotifyUrl,
      appleMusicUrl: creatorProfiles.appleMusicUrl,
      youtubeUrl: creatorProfiles.youtubeUrl,
      spotifyId: creatorProfiles.spotifyId,
      isPublic: creatorProfiles.isPublic,
      isVerified: creatorProfiles.isVerified,
      isClaimed: creatorProfiles.isClaimed,
      isFeatured: creatorProfiles.isFeatured,
      marketingOptOut: creatorProfiles.marketingOptOut,
      settings: creatorProfiles.settings,
      theme: creatorProfiles.theme,
      profileViews: creatorProfiles.profileViews,
      genres: creatorProfiles.genres,
      spotifyPopularity: creatorProfiles.spotifyPopularity,
      createdAt: creatorProfiles.createdAt,
      updatedAt: creatorProfiles.updatedAt,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.usernameNormalized, username.toLowerCase()))
    .limit(1);

  return profile ?? null;
}

/**
 * Get a profile with user context (isPro, clerkId).
 *
 * @param username - The username to look up
 * @returns Profile with user data or null if not found
 */
export async function getProfileWithUser(
  username: string
): Promise<ProfileWithUser | null> {
  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      userId: creatorProfiles.userId,
      userIsPro: users.isPro,
      userClerkId: users.clerkId,
      creatorType: creatorProfiles.creatorType,
      username: creatorProfiles.username,
      usernameNormalized: creatorProfiles.usernameNormalized,
      displayName: creatorProfiles.displayName,
      bio: creatorProfiles.bio,
      avatarUrl: creatorProfiles.avatarUrl,
      spotifyUrl: creatorProfiles.spotifyUrl,
      appleMusicUrl: creatorProfiles.appleMusicUrl,
      youtubeUrl: creatorProfiles.youtubeUrl,
      spotifyId: creatorProfiles.spotifyId,
      isPublic: creatorProfiles.isPublic,
      isVerified: creatorProfiles.isVerified,
      isClaimed: creatorProfiles.isClaimed,
      isFeatured: creatorProfiles.isFeatured,
      marketingOptOut: creatorProfiles.marketingOptOut,
      settings: creatorProfiles.settings,
      theme: creatorProfiles.theme,
      profileViews: creatorProfiles.profileViews,
      genres: creatorProfiles.genres,
      spotifyPopularity: creatorProfiles.spotifyPopularity,
      createdAt: creatorProfiles.createdAt,
      updatedAt: creatorProfiles.updatedAt,
    })
    .from(creatorProfiles)
    .leftJoin(users, eq(users.id, creatorProfiles.userId))
    .where(eq(creatorProfiles.usernameNormalized, username.toLowerCase()))
    .limit(1);

  return profile ?? null;
}

/**
 * Get social links for a profile.
 * Only returns active links (not rejected or inactive).
 *
 * @param profileId - The profile ID
 * @returns Array of social links
 */
export async function getProfileSocialLinks(
  profileId: string
): Promise<ProfileSocialLink[]> {
  const links = await db
    .select({
      id: socialLinks.id,
      creatorProfileId: socialLinks.creatorProfileId,
      platform: socialLinks.platform,
      platformType: socialLinks.platformType,
      url: socialLinks.url,
      displayText: socialLinks.displayText,
      clicks: socialLinks.clicks,
      isActive: socialLinks.isActive,
      sortOrder: socialLinks.sortOrder,
      createdAt: socialLinks.createdAt,
      updatedAt: socialLinks.updatedAt,
    })
    .from(socialLinks)
    .where(
      and(
        eq(socialLinks.creatorProfileId, profileId),
        eq(socialLinks.isActive, true),
        ne(socialLinks.state, 'rejected')
      )
    )
    .orderBy(socialLinks.sortOrder)
    .limit(MAX_SOCIAL_LINKS);

  if (links.length === MAX_SOCIAL_LINKS) {
    captureWarning('[profile-service] MAX_SOCIAL_LINKS limit hit', {
      profileId,
      count: links.length,
    });
  }

  return links;
}

/**
 * Get contacts for a profile.
 *
 * @param profileId - The profile ID
 * @returns Array of contacts
 */
export async function getProfileContacts(
  profileId: string
): Promise<CreatorContact[]> {
  try {
    const contacts = await db
      .select({
        id: creatorContacts.id,
        creatorProfileId: creatorContacts.creatorProfileId,
        role: creatorContacts.role,
        customLabel: creatorContacts.customLabel,
        personName: creatorContacts.personName,
        companyName: creatorContacts.companyName,
        territories: creatorContacts.territories,
        email: creatorContacts.email,
        phone: creatorContacts.phone,
        preferredChannel: creatorContacts.preferredChannel,
        isActive: creatorContacts.isActive,
        sortOrder: creatorContacts.sortOrder,
        createdAt: creatorContacts.createdAt,
        updatedAt: creatorContacts.updatedAt,
      })
      .from(creatorContacts)
      .where(
        and(
          eq(creatorContacts.creatorProfileId, profileId),
          eq(creatorContacts.isActive, true)
        )
      )
      .orderBy(creatorContacts.sortOrder, creatorContacts.createdAt)
      .limit(MAX_CONTACTS);

    if (contacts.length === MAX_CONTACTS) {
      captureWarning('[profile-service] MAX_CONTACTS limit hit', {
        profileId,
        count: contacts.length,
      });
    }

    return contacts;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const causeMessage =
      error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : '';
    if (
      errorMessage.includes('does not exist') ||
      causeMessage.includes('does not exist')
    ) {
      captureWarning(
        '[profile-service] creator_contacts table does not exist, returning empty'
      );
      return [];
    }
    throw error;
  }
}

/**
 * Get a profile with all related data (links, contacts, user) in a single query.
 * This is the main query for public profile pages.
 *
 * Optimized:
 * - Uses Redis edge cache (5 min TTL) to avoid Neon round-trips
 * - Parallel database queries when cache misses
 * - Falls back gracefully if Redis is unavailable
 *
 * @param username - The username to look up
 * @param options - Query options
 * @returns Full profile with links and contacts, or null if not found
 */
export async function getProfileWithLinks(
  username: string,
  options?: { skipCache?: boolean }
): Promise<ProfileWithLinks | null> {
  const normalizedUsername = username.toLowerCase();
  const cacheKey = `${PROFILE_CACHE_KEY_PREFIX}${normalizedUsername}`;
  const redis = getRedis();

  // Try Redis cache first (unless explicitly skipped)
  if (redis && !options?.skipCache) {
    try {
      const cached = await redis.get<ProfileWithLinks>(cacheKey);
      if (cached) {
        // Revive Date objects from JSON
        return reviveProfileDates(cached);
      }
    } catch (error) {
      captureWarning('[profile-service] Redis cache read failed', { error });
      // Fall through to database query
    }
  }

  // Cache miss - query database with parallel fetches and timeout
  // Timeout ensures we fail fast (5s) rather than blocking on Neon retry backoff (15s)
  let result: ProfileWithLinks | null;
  try {
    result = await Promise.race([
      fetchProfileFromDatabase(normalizedUsername),
      new Promise<null>((_, reject) =>
        setTimeout(
          () => reject(new Error('Profile query timeout')),
          PUBLIC_PROFILE_QUERY_TIMEOUT_MS
        )
      ),
    ]);
  } catch (error) {
    captureWarning('[profile-service] Profile query failed or timed out', {
      error,
      username: normalizedUsername,
    });
    return null;
  }

  // Cache the result in Redis (fire-and-forget)
  // Serialize Date objects to ISO strings to prevent TransformStream serialization errors
  if (redis && result) {
    redis
      .set(cacheKey, serializeProfileDates(result), {
        ex: PROFILE_CACHE_TTL_SECONDS,
      })
      .catch(error => {
        captureWarning('[profile-service] Redis cache write failed', { error });
      });
  }

  return result;
}

/**
 * Serialize Date objects to ISO strings for Redis storage.
 * This prevents TransformStream serialization issues when caching complex objects.
 */
function serializeProfileDates(profile: ProfileWithLinks): unknown {
  return {
    ...profile,
    createdAt: toISOStringSafe(profile.createdAt),
    updatedAt: toISOStringSafe(profile.updatedAt),
    socialLinks: profile.socialLinks.map(link => ({
      ...link,
      createdAt: toISOStringSafe(link.createdAt),
      updatedAt: toISOStringSafe(link.updatedAt),
    })),
    contacts: profile.contacts.map(contact => ({
      ...contact,
      createdAt: toISOStringSafe(contact.createdAt),
      updatedAt: toISOStringSafe(contact.updatedAt),
    })),
    latestRelease: profile.latestRelease
      ? {
          ...profile.latestRelease,
          releaseDate: profile.latestRelease.releaseDate
            ? toISOStringSafe(profile.latestRelease.releaseDate)
            : null,
          createdAt: toISOStringSafe(profile.latestRelease.createdAt),
          updatedAt: toISOStringSafe(profile.latestRelease.updatedAt),
        }
      : null,
  };
}

/**
 * Revive Date objects from JSON-serialized profile data.
 */
function reviveProfileDates(profile: ProfileWithLinks): ProfileWithLinks {
  return {
    ...profile,
    createdAt: new Date(profile.createdAt),
    updatedAt: new Date(profile.updatedAt),
    socialLinks: profile.socialLinks.map(link => ({
      ...link,
      createdAt: new Date(link.createdAt),
      updatedAt: new Date(link.updatedAt),
    })),
    contacts: profile.contacts.map(contact => ({
      ...contact,
      createdAt: new Date(contact.createdAt),
      updatedAt: new Date(contact.updatedAt),
    })),
    latestRelease: profile.latestRelease
      ? {
          ...profile.latestRelease,
          releaseDate: profile.latestRelease.releaseDate
            ? new Date(profile.latestRelease.releaseDate)
            : null,
          createdAt: new Date(profile.latestRelease.createdAt),
          updatedAt: new Date(profile.latestRelease.updatedAt),
        }
      : null,
  };
}

/**
 * Fetch profile data from the database with parallel queries.
 */
async function fetchProfileFromDatabase(
  normalizedUsername: string
): Promise<ProfileWithLinks | null> {
  // Step 1: Fetch profile first (single query with user JOIN)
  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      userId: creatorProfiles.userId,
      userIsPro: users.isPro,
      userClerkId: users.clerkId,
      creatorType: creatorProfiles.creatorType,
      username: creatorProfiles.username,
      usernameNormalized: creatorProfiles.usernameNormalized,
      displayName: creatorProfiles.displayName,
      bio: creatorProfiles.bio,
      avatarUrl: creatorProfiles.avatarUrl,
      spotifyUrl: creatorProfiles.spotifyUrl,
      appleMusicUrl: creatorProfiles.appleMusicUrl,
      youtubeUrl: creatorProfiles.youtubeUrl,
      spotifyId: creatorProfiles.spotifyId,
      isPublic: creatorProfiles.isPublic,
      isVerified: creatorProfiles.isVerified,
      isClaimed: creatorProfiles.isClaimed,
      isFeatured: creatorProfiles.isFeatured,
      marketingOptOut: creatorProfiles.marketingOptOut,
      settings: creatorProfiles.settings,
      theme: creatorProfiles.theme,
      profileViews: creatorProfiles.profileViews,
      genres: creatorProfiles.genres,
      spotifyPopularity: creatorProfiles.spotifyPopularity,
      createdAt: creatorProfiles.createdAt,
      updatedAt: creatorProfiles.updatedAt,
    })
    .from(creatorProfiles)
    .leftJoin(users, eq(users.id, creatorProfiles.userId))
    .where(eq(creatorProfiles.usernameNormalized, normalizedUsername))
    .limit(1);

  if (!profile) return null;

  // Step 2: Fetch related data using profile ID (3 parallel queries, no redundant JOINs)
  const [linksResult, contactsResult, latestRelease] = await Promise.all([
    // Social links - use profile ID directly (no JOIN to creatorProfiles needed)
    db
      .select({
        id: socialLinks.id,
        creatorProfileId: socialLinks.creatorProfileId,
        platform: socialLinks.platform,
        platformType: socialLinks.platformType,
        url: socialLinks.url,
        displayText: socialLinks.displayText,
        clicks: socialLinks.clicks,
        isActive: socialLinks.isActive,
        sortOrder: socialLinks.sortOrder,
        createdAt: socialLinks.createdAt,
        updatedAt: socialLinks.updatedAt,
      })
      .from(socialLinks)
      .where(
        and(
          eq(socialLinks.creatorProfileId, profile.id),
          eq(socialLinks.isActive, true),
          ne(socialLinks.state, 'rejected')
        )
      )
      .orderBy(socialLinks.sortOrder)
      .limit(MAX_SOCIAL_LINKS),

    // Contacts - use profile ID directly (no JOIN to creatorProfiles needed)
    db
      .select({
        id: creatorContacts.id,
        creatorProfileId: creatorContacts.creatorProfileId,
        role: creatorContacts.role,
        customLabel: creatorContacts.customLabel,
        personName: creatorContacts.personName,
        companyName: creatorContacts.companyName,
        territories: creatorContacts.territories,
        email: creatorContacts.email,
        phone: creatorContacts.phone,
        preferredChannel: creatorContacts.preferredChannel,
        isActive: creatorContacts.isActive,
        sortOrder: creatorContacts.sortOrder,
        createdAt: creatorContacts.createdAt,
        updatedAt: creatorContacts.updatedAt,
      })
      .from(creatorContacts)
      .where(
        and(
          eq(creatorContacts.creatorProfileId, profile.id),
          eq(creatorContacts.isActive, true)
        )
      )
      .orderBy(creatorContacts.sortOrder, creatorContacts.createdAt)
      .limit(MAX_CONTACTS),

    // Latest release - still uses username (existing function)
    getLatestReleaseByUsername(normalizedUsername),
  ]);

  return {
    ...profile,
    socialLinks: linksResult,
    contacts: contactsResult,
    latestRelease,
  };
}

/**
 * Invalidate the Redis cache for a profile.
 * Call this after profile updates.
 */
export async function invalidateProfileEdgeCache(
  usernameNormalized: string
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const cacheKey = `${PROFILE_CACHE_KEY_PREFIX}${usernameNormalized.toLowerCase()}`;
  try {
    await redis.del(cacheKey);
  } catch (error) {
    captureWarning('[profile-service] Failed to invalidate edge cache', {
      error,
    });
  }
}

/**
 * Get a profile summary (minimal data for lists).
 *
 * @param profileId - The profile ID
 * @returns Profile summary or null if not found
 */
export async function getProfileSummary(
  profileId: string
): Promise<ProfileSummary | null> {
  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      username: creatorProfiles.username,
      usernameNormalized: creatorProfiles.usernameNormalized,
      displayName: creatorProfiles.displayName,
      avatarUrl: creatorProfiles.avatarUrl,
      isPublic: creatorProfiles.isPublic,
      isClaimed: creatorProfiles.isClaimed,
      isVerified: creatorProfiles.isVerified,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);

  return profile ?? null;
}

/**
 * Check if a claim token is valid for a profile.
 *
 * @param username - The username
 * @param claimToken - The claim token to validate
 * @returns True if the token is valid
 */
export async function isClaimTokenValid(
  username: string,
  claimToken: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.usernameNormalized, username.toLowerCase()),
        eq(creatorProfiles.claimToken, claimToken),
        eq(creatorProfiles.isPublic, true),
        eq(creatorProfiles.isClaimed, false)
      )
    )
    .limit(1);

  return Boolean(row);
}

/**
 * Get top public profiles for static generation.
 * Returns featured profiles first, then by profile views.
 *
 * @param limit - Maximum number of profiles to return (default: 100)
 * @returns Array of usernames for static generation
 */
export async function getTopProfilesForStaticGeneration(
  limit = 100
): Promise<{ username: string }[]> {
  const { desc, or } = await import('drizzle-orm');

  const profiles = await db
    .select({
      username: creatorProfiles.username,
    })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.isPublic, true),
        or(
          eq(creatorProfiles.isFeatured, true),
          eq(creatorProfiles.isClaimed, true)
        )
      )
    )
    .orderBy(
      desc(creatorProfiles.isFeatured),
      desc(creatorProfiles.profileViews)
    )
    .limit(limit);

  return profiles;
}
