/**
 * Prepared Statements for Hot Query Paths
 *
 * These prepared statements are compiled once and reused,
 * reducing query parsing overhead for frequently-executed queries.
 *
 * Benefits:
 * - Eliminates query parsing on each execution
 * - Reduces CPU overhead by 10-20% for repeated queries
 * - Improves connection pool efficiency
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from './index';
import { creatorProfiles, users } from './schema';

// Common field selections to reduce duplication
const userCoreFields = {
  id: users.id,
  clerkId: users.clerkId,
  email: users.email,
  isAdmin: users.isAdmin,
  isPro: users.isPro,
  userStatus: users.userStatus,
} as const;

const profileCoreFields = {
  id: creatorProfiles.id,
  userId: creatorProfiles.userId,
  username: creatorProfiles.username,
  usernameNormalized: creatorProfiles.usernameNormalized,
  displayName: creatorProfiles.displayName,
  avatarUrl: creatorProfiles.avatarUrl,
  isPublic: creatorProfiles.isPublic,
  isClaimed: creatorProfiles.isClaimed,
} as const;

/**
 * Prepared statement for user lookup by Clerk ID.
 * Used by: getDbUser(), authentication checks
 */
export const getUserByClerkIdPrepared = db
  .select(userCoreFields)
  .from(users)
  .where(eq(users.clerkId, sql.placeholder('clerkId')))
  .limit(1)
  .prepare('get_user_by_clerk_id');

/**
 * Prepared statement for profile lookup by user ID.
 * Used by: getProfileByDbUserId(), profile fetching
 */
export const getProfileByUserIdPrepared = db
  .select({
    ...profileCoreFields,
    onboardingCompletedAt: creatorProfiles.onboardingCompletedAt,
  })
  .from(creatorProfiles)
  .where(
    and(
      eq(creatorProfiles.userId, sql.placeholder('userId')),
      eq(creatorProfiles.isClaimed, true)
    )
  )
  .limit(1)
  .prepare('get_profile_by_user_id');

/**
 * Prepared statement for combined session context (single query).
 * Combines user and profile lookup into one database round trip.
 * Used by: getSessionContext()
 */
export const getSessionContextPrepared = db
  .select({
    userId: users.id,
    userClerkId: users.clerkId,
    userEmail: users.email,
    userIsAdmin: users.isAdmin,
    userIsPro: users.isPro,
    userStatus: users.userStatus,
    profileId: creatorProfiles.id,
    profileUserId: creatorProfiles.userId,
    profileUsername: creatorProfiles.username,
    profileUsernameNormalized: creatorProfiles.usernameNormalized,
    profileDisplayName: creatorProfiles.displayName,
    profileAvatarUrl: creatorProfiles.avatarUrl,
    profileIsPublic: creatorProfiles.isPublic,
    profileIsClaimed: creatorProfiles.isClaimed,
    profileOnboardingCompletedAt: creatorProfiles.onboardingCompletedAt,
  })
  .from(users)
  .leftJoin(
    creatorProfiles,
    and(
      eq(creatorProfiles.userId, users.id),
      eq(creatorProfiles.isClaimed, true)
    )
  )
  .where(eq(users.clerkId, sql.placeholder('clerkId')))
  .limit(1)
  .prepare('get_session_context');

/**
 * Prepared statement for profile lookup by username.
 * Used by: public profile pages, profile fetching
 */
export const getProfileByUsernamePrepared = db
  .select({
    ...profileCoreFields,
    bio: creatorProfiles.bio,
    isVerified: creatorProfiles.isVerified,
    venmoHandle: creatorProfiles.venmoHandle,
    creatorType: creatorProfiles.creatorType,
    theme: creatorProfiles.theme,
    settings: creatorProfiles.settings,
  })
  .from(creatorProfiles)
  .where(eq(creatorProfiles.usernameNormalized, sql.placeholder('username')))
  .limit(1)
  .prepare('get_profile_by_username');
