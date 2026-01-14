/**
 * Shared Database Query Helpers
 *
 * Common query patterns used across API routes to eliminate duplication.
 * These helpers ensure consistent security checks and field selection.
 *
 * All authenticated queries verify ownership using the clerkUserId.
 */

import 'server-only';

import { and, eq } from 'drizzle-orm';
import type { DbType } from '@/lib/db';
import { creatorProfiles, socialLinks, users } from '@/lib/db/schema';

/**
 * Result type for authenticated profile queries.
 * Includes core profile fields needed for ownership verification.
 */
export interface AuthenticatedProfile {
  id: string;
  usernameNormalized: string;
  userId: string | null;
  avatarUrl: string | null;
  avatarLockedByUser: boolean;
  displayNameLocked: boolean;
}

/**
 * Get a creator profile with ownership verification.
 *
 * Joins creatorProfiles with users table to verify the profile belongs
 * to the authenticated user. This is the standard pattern for all
 * authenticated profile operations.
 *
 * Security: Returns null if profile doesn't exist OR user doesn't own it.
 *
 * @param tx - Database transaction or connection
 * @param profileId - Profile ID to fetch
 * @param clerkUserId - Authenticated user's Clerk ID
 * @returns Profile if found and owned by user, null otherwise
 *
 * @example
 * ```ts
 * const profile = await getAuthenticatedProfile(db, profileId, clerkUserId);
 * if (!profile) {
 *   return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
 * }
 * ```
 */
export async function getAuthenticatedProfile(
  tx: DbType,
  profileId: string,
  clerkUserId: string
): Promise<AuthenticatedProfile | null> {
  const [profile] = await tx
    .select({
      id: creatorProfiles.id,
      usernameNormalized: creatorProfiles.usernameNormalized,
      userId: creatorProfiles.userId,
      avatarUrl: creatorProfiles.avatarUrl,
      avatarLockedByUser: creatorProfiles.avatarLockedByUser,
      displayNameLocked: creatorProfiles.displayNameLocked,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(
      and(eq(creatorProfiles.id, profileId), eq(users.clerkId, clerkUserId))
    )
    .limit(1);

  return profile ?? null;
}

/**
 * Result type for social links queries.
 * Includes all fields typically needed for link display and management.
 */
export interface SocialLink {
  id: string;
  platform: string;
  platformType: string | null;
  url: string;
  sortOrder: number | null;
  isActive: boolean | null;
  displayText: string | null;
  state: string | null;
  confidence: string;
  sourcePlatform: string | null;
  sourceType: string | null;
  evidence: unknown;
  version: number;
}

/**
 * Get all social links for a creator profile.
 *
 * Returns links ordered by sortOrder (the user's custom ordering).
 * Commonly used for profile display and link management.
 *
 * @param tx - Database transaction or connection
 * @param profileId - Profile ID to fetch links for
 * @param options - Optional filters
 * @param options.activeOnly - Only return active links (default: false)
 * @param options.limit - Maximum number of links to return (default: 100)
 * @returns Array of social links, ordered by sortOrder
 *
 * @example
 * ```ts
 * const links = await getProfileSocialLinks(db, profileId, {
 *   activeOnly: true
 * });
 * ```
 */
export async function getProfileSocialLinks(
  tx: DbType,
  profileId: string,
  options: {
    activeOnly?: boolean;
    limit?: number;
  } = {}
): Promise<SocialLink[]> {
  const { activeOnly = false, limit = 100 } = options;

  // Build where conditions
  const conditions = [eq(socialLinks.creatorProfileId, profileId)];

  if (activeOnly) {
    conditions.push(eq(socialLinks.isActive, true));
  }

  const links = await tx
    .select({
      id: socialLinks.id,
      platform: socialLinks.platform,
      platformType: socialLinks.platformType,
      url: socialLinks.url,
      sortOrder: socialLinks.sortOrder,
      isActive: socialLinks.isActive,
      displayText: socialLinks.displayText,
      state: socialLinks.state,
      confidence: socialLinks.confidence,
      sourcePlatform: socialLinks.sourcePlatform,
      sourceType: socialLinks.sourceType,
      evidence: socialLinks.evidence,
      version: socialLinks.version,
    })
    .from(socialLinks)
    .where(and(...conditions))
    .orderBy(socialLinks.sortOrder)
    .limit(limit);

  return links;
}

/**
 * Result type for user lookup queries.
 * Includes commonly needed user fields for auth and billing checks.
 */
export interface UserRecord {
  id: string;
  clerkId: string;
  email: string | null;
  isAdmin: boolean;
  isPro: boolean | null;
  userStatus: string;
  deletedAt: Date | null;
}

/**
 * Get user record by Clerk ID.
 *
 * Common pattern for authentication checks across API routes.
 * Returns user with billing and admin status for authorization.
 *
 * @param tx - Database transaction or connection
 * @param clerkUserId - Clerk user ID
 * @returns User record if found, null otherwise
 *
 * @example
 * ```ts
 * const user = await getUserByClerkId(db, clerkUserId);
 * if (!user) {
 *   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 * }
 * ```
 */
export async function getUserByClerkId(
  tx: DbType,
  clerkUserId: string
): Promise<UserRecord | null> {
  const [user] = await tx
    .select({
      id: users.id,
      clerkId: users.clerkId,
      email: users.email,
      isAdmin: users.isAdmin,
      isPro: users.isPro,
      userStatus: users.userStatus,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  return user ?? null;
}

/**
 * Verify profile ownership without fetching full profile data.
 *
 * Lightweight ownership check that returns only the profile ID if the
 * authenticated user owns the specified profile. Use this when you only
 * need to verify ownership and don't need other profile fields.
 *
 * Security: Returns null if profile doesn't exist OR user doesn't own it.
 *
 * @param tx - Database transaction or connection
 * @param profileId - Profile ID to verify
 * @param clerkUserId - Authenticated user's Clerk ID
 * @returns Object with profile ID if owned by user, null otherwise
 *
 * @example
 * ```ts
 * const profile = await verifyProfileOwnership(db, profileId, clerkUserId);
 * if (!profile) {
 *   return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
 * }
 * // profile.id is now available for queries
 * ```
 */
export async function verifyProfileOwnership(
  tx: DbType,
  profileId: string,
  clerkUserId: string
): Promise<{ id: string } | null> {
  const [profile] = await tx
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .innerJoin(users, eq(creatorProfiles.userId, users.id))
    .where(
      and(eq(users.clerkId, clerkUserId), eq(creatorProfiles.id, profileId))
    )
    .limit(1);

  return profile ?? null;
}
