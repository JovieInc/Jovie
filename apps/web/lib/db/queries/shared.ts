/**
 * Shared Database Query Helpers
 *
 * Common query patterns used across API routes to eliminate duplication.
 * These helpers ensure consistent security checks and field selection.
 *
 * All authenticated queries verify ownership using the app user id returned by
 * the Better Auth session boundary.
 */

import 'server-only';

import { and, eq, isNotNull, or, type SQL } from 'drizzle-orm';
import type { DbOrTransaction } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Match a users row by any live identity shape (Clerk → Better Auth
 * migration): legacy Clerk id (`user_…` in `clerk_id`), bridge value
 * (`ba:<baId>` in `clerk_id`), raw Better Auth id, or the app `users.id`
 * UUID that `getCachedAuth()` returns. Matching only `clerk_id` sent every
 * BA-session dashboard request into the /app ↔ /signin redirect loop
 * (OpportunityInboxRoute streamed redirect).
 *
 * The `users.id` clause is only added for UUID-shaped input — comparing a
 * uuid column against a non-UUID string throws a Postgres cast error.
 */
export function userIdentityFilter(authUserId: string): SQL {
  const clauses: SQL[] = [
    eq(users.clerkId, authUserId) as SQL,
    eq(users.betterAuthUserId, authUserId) as SQL,
  ];
  if (UUID_PATTERN.test(authUserId)) {
    clauses.push(eq(users.id, authUserId) as SQL);
  }
  return or(...clauses) as SQL;
}

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
 * Verifies canonical ownership via userProfileClaims with a legacy fallback
 * to creatorProfiles.userId while older rows are still being migrated.
 *
 * Security: Returns null if profile doesn't exist OR user doesn't own it.
 *
 * @param tx - Database transaction or connection
 * @param profileId - Profile ID to fetch
 * @param appUserId - Authenticated app `users.id`
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
  tx: DbOrTransaction,
  profileId: string,
  appUserId: string
): Promise<AuthenticatedProfile | null> {
  const [profile] = await tx
    .select({
      id: creatorProfiles.id,
      usernameNormalized: creatorProfiles.usernameNormalized,
      userId: users.id,
      avatarUrl: creatorProfiles.avatarUrl,
      avatarLockedByUser: creatorProfiles.avatarLockedByUser,
      displayNameLocked: creatorProfiles.displayNameLocked,
    })
    .from(creatorProfiles)
    .innerJoin(users, userIdentityFilter(appUserId))
    .leftJoin(
      userProfileClaims,
      and(
        eq(userProfileClaims.creatorProfileId, creatorProfiles.id),
        eq(userProfileClaims.userId, users.id)
      )
    )
    .where(
      and(
        eq(creatorProfiles.id, profileId),
        or(
          isNotNull(userProfileClaims.id),
          eq(creatorProfiles.userId, users.id)
        )
      )
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
  tx: DbOrTransaction,
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
  clerkId: string | null;
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
  tx: DbOrTransaction,
  clerkUserId: string
): Promise<UserRecord | null> {
  return getUserByIdentity(tx, clerkUserId);
}

/**
 * Resolve a user across the legacy Clerk-ID and Better Auth app-ID
 * generations. Authenticated request callers receive `users.id`, while
 * admin and legacy webhook callers may still provide `users.clerkId`.
 */
export async function getUserByIdentity(
  tx: DbOrTransaction,
  userIdentity: string
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
    // Single OR query replaces the prior clerkId-then-uuid two-step: it also
    // matches raw better_auth_user_id, and the uuid clause is shape-guarded —
    // the two-step fallback threw a Postgres cast error whenever a non-UUID
    // identity (stale legacy clerk id) missed on clerk_id.
    .where(userIdentityFilter(userIdentity))
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
 * Security: Returns null if profile doesn't exist OR the user does not own it.
 *
 * @param tx - Database transaction or connection
 * @param profileId - Profile ID to verify
 * @param appUserId - Authenticated app `users.id`
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
  tx: DbOrTransaction,
  profileId: string,
  appUserId: string
): Promise<{ id: string } | null> {
  const [profile] = await tx
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .innerJoin(users, userIdentityFilter(appUserId))
    .leftJoin(
      userProfileClaims,
      and(
        eq(userProfileClaims.creatorProfileId, creatorProfiles.id),
        eq(userProfileClaims.userId, users.id)
      )
    )
    .where(
      and(
        eq(creatorProfiles.id, profileId),
        or(
          isNotNull(userProfileClaims.id),
          eq(creatorProfiles.userId, users.id)
        )
      )
    )
    .limit(1);

  return profile ?? null;
}
