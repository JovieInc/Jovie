import 'server-only';

import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { getCachedAuth } from '@/lib/auth/cached';
import { type DbOrTransaction, type DbType, db } from '@/lib/db';
import { creatorProfiles, users } from '@/lib/db/schema';

/**
 * Validates that a userId is a safe Clerk ID format
 * Clerk IDs follow the pattern: user_[a-zA-Z0-9]+
 */
export function validateClerkUserId(userId: string): void {
  // Clerk user IDs are alphanumeric with underscores, typically starting with 'user_'
  const clerkIdPattern = /^[a-zA-Z0-9_-]+$/;
  if (!clerkIdPattern.test(userId)) {
    throw new Error('Invalid user ID format');
  }
  if (userId.length > 255) {
    throw new Error('User ID too long');
  }
}

/**
 * Sets up the database session for the authenticated user
 * This enables RLS policies to work properly with Clerk user ID
 */
async function resolveClerkUserId(clerkUserId?: string): Promise<string> {
  if (clerkUserId) {
    validateClerkUserId(clerkUserId);
    return clerkUserId;
  }

  const { userId } = await getCachedAuth();

  if (!userId) {
    throw new Error('Unauthorized');
  }

  // Validate userId format to prevent SQL injection
  validateClerkUserId(userId);
  return userId;
}

/**
 * Sets up the database session for the authenticated user
 * This enables RLS policies to work properly with Clerk user ID
 */
export async function setupDbSession(clerkUserId?: string) {
  const userId = await resolveClerkUserId(clerkUserId);

  // Set the session variables for RLS in a single query
  // Using sql.raw with validated input to prevent SQL injection
  await db.execute(
    drizzleSql`SELECT set_config('app.user_id', ${userId}, true), set_config('app.clerk_user_id', ${userId}, true)`
  );

  return { userId };
}

/**
 * Wrapper function to run database operations with proper session setup
 */
export async function withDbSession<T>(
  operation: (userId: string) => Promise<T>,
  options?: { clerkUserId?: string }
): Promise<T> {
  const { userId } = await setupDbSession(options?.clerkUserId);
  return await operation(userId);
}

/**
 * Transaction isolation levels supported by PostgreSQL
 */
export type IsolationLevel =
  | 'read_committed'
  | 'repeatable_read'
  | 'serializable';

/**
 * Run DB operations inside a transaction with RLS session set.
 * Ensures SET LOCAL app.clerk_user_id is applied within the transaction scope.
 *
 * @param operation - The database operation to execute within the transaction
 * @param options.clerkUserId - Optional explicit Clerk user ID (uses auth() if not provided)
 * @param options.isolationLevel - Transaction isolation level (default: read_committed)
 *   - 'read_committed': Default, allows phantom reads between SELECT and INSERT
 *   - 'repeatable_read': Prevents non-repeatable reads
 *   - 'serializable': Strictest, prevents all concurrency anomalies (use for critical operations like profile creation)
 */
export async function withDbSessionTx<T>(
  operation: (tx: DbOrTransaction, userId: string) => Promise<T>,
  options?: { clerkUserId?: string; isolationLevel?: IsolationLevel }
): Promise<T> {
  const userId = await resolveClerkUserId(options?.clerkUserId);
  const isolationLevel = options?.isolationLevel ?? 'read_committed';

  // In tests, db may be a lightweight mock without transaction support.
  if (typeof (db as DbType).transaction !== 'function') {
    // Fall back to using the mocked db object directly.
    return await operation(db, userId);
  }

  return await db.transaction(async tx => {
    // Set transaction isolation level if not default
    // CRITICAL: For onboarding, use SERIALIZABLE to prevent race conditions
    // where two users claim the same handle simultaneously
    if (isolationLevel !== 'read_committed') {
      const isolationSql =
        isolationLevel === 'serializable'
          ? drizzleSql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`
          : drizzleSql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`;
      await tx.execute(isolationSql);
    }

    // Important: SET LOCAL must be inside the transaction to take effect.
    // In unit tests, drizzleSql may be mocked without .raw; guard accordingly.
    // Combined into single query for performance (saves one DB round trip)
    await tx.execute(
      drizzleSql`SELECT set_config('app.user_id', ${userId}, true), set_config('app.clerk_user_id', ${userId}, true)`
    );
    // Transaction client now properly typed with neon-serverless driver
    return await operation(tx, userId);
  });
}

/**
 * Get the current user ID or throw if not authenticated
 */
export async function requireAuth() {
  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new Error('Authentication required');
  }
  return userId;
}

// =============================================================================
// User/Profile Context Helpers
// =============================================================================

/**
 * Minimal user data returned by context helpers.
 * Contains only the fields commonly needed for auth checks.
 */
export interface DbUserContext {
  id: string;
  clerkId: string;
  email: string | null;
  isAdmin: boolean;
  isPro: boolean | null;
  userStatus:
    | 'waitlist_pending'
    | 'waitlist_approved'
    | 'profile_claimed'
    | 'onboarding_incomplete'
    | 'active'
    | 'suspended'
    | 'banned';
}

/**
 * Minimal profile data returned by context helpers.
 * Contains only the fields commonly needed for dashboard operations.
 */
export interface ProfileContext {
  id: string;
  userId: string | null;
  username: string | null;
  usernameNormalized: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isPublic: boolean | null;
  isClaimed: boolean | null;
  onboardingCompletedAt: Date | null;
}

/**
 * Combined user and profile context.
 */
export interface SessionContext {
  clerkUserId: string;
  user: DbUserContext;
  profile: ProfileContext | null;
}

/**
 * Get the current user's database record by Clerk ID.
 * This is the single source of truth for user lookups.
 *
 * @param clerkUserId - Clerk user ID (uses auth() if not provided)
 * @returns User record or null if not found
 */
export async function getDbUser(
  clerkUserId?: string
): Promise<DbUserContext | null> {
  const userId = await resolveClerkUserId(clerkUserId);

  const [user] = await db
    .select({
      id: users.id,
      clerkId: users.clerkId,
      email: users.email,
      isAdmin: users.isAdmin,
      isPro: users.isPro,
      userStatus: users.userStatus,
    })
    .from(users)
    .where(eq(users.clerkId, userId))
    .limit(1);

  return user ?? null;
}

/**
 * Get the current user's claimed profile.
 * Returns the profile associated with the user's database record.
 *
 * @param dbUserId - Database user ID
 * @returns Profile record or null if not found
 */
export async function getProfileByDbUserId(
  dbUserId: string
): Promise<ProfileContext | null> {
  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      userId: creatorProfiles.userId,
      username: creatorProfiles.username,
      usernameNormalized: creatorProfiles.usernameNormalized,
      displayName: creatorProfiles.displayName,
      avatarUrl: creatorProfiles.avatarUrl,
      isPublic: creatorProfiles.isPublic,
      isClaimed: creatorProfiles.isClaimed,
      onboardingCompletedAt: creatorProfiles.onboardingCompletedAt,
    })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.userId, dbUserId),
        eq(creatorProfiles.isClaimed, true)
      )
    )
    .limit(1);

  return profile ?? null;
}

/**
 * Get the full session context: clerkUserId, user, and profile.
 * This is the recommended way to get user/profile data in server actions and API routes.
 *
 * Replaces the common pattern:
 * ```typescript
 * const { userId } = await getCachedAuth();
 * const [user] = await db.select().from(users).where(eq(users.clerkId, userId));
 * const [profile] = await db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, user.id));
 * ```
 *
 * With:
 * ```typescript
 * const { user, profile } = await getSessionContext();
 * ```
 *
 * @param options.clerkUserId - Optional explicit Clerk user ID
 * @param options.requireUser - If true, throws if user not found (default: true)
 * @param options.requireProfile - If true, throws if profile not found (default: false)
 * @returns Session context with user and profile
 */
export async function getSessionContext(options?: {
  clerkUserId?: string;
  requireUser?: boolean;
  requireProfile?: boolean;
}): Promise<SessionContext> {
  const { requireUser = true, requireProfile = false } = options ?? {};

  const clerkUserId = await resolveClerkUserId(options?.clerkUserId);

  // Performance optimization: Single JOIN query instead of two sequential queries
  // This reduces database round trips from 2 to 1 (50% reduction)
  const [result] = await db
    .select({
      // User fields
      userId: users.id,
      userClerkId: users.clerkId,
      userEmail: users.email,
      userIsAdmin: users.isAdmin,
      userIsPro: users.isPro,
      userStatus: users.userStatus,
      // Profile fields (nullable from LEFT JOIN)
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
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  // User not found
  if (!result && requireUser) {
    throw new Error('User not found');
  }

  if (!result) {
    return {
      clerkUserId,
      user: null as unknown as DbUserContext,
      profile: null,
    };
  }

  // Build user context from result
  const user: DbUserContext = {
    id: result.userId,
    clerkId: result.userClerkId,
    email: result.userEmail,
    isAdmin: result.userIsAdmin,
    isPro: result.userIsPro,
    userStatus: result.userStatus,
  };

  // Build profile context from result (if exists)
  const profile: ProfileContext | null = result.profileId
    ? {
        id: result.profileId,
        userId: result.profileUserId,
        username: result.profileUsername,
        usernameNormalized: result.profileUsernameNormalized,
        displayName: result.profileDisplayName,
        avatarUrl: result.profileAvatarUrl,
        isPublic: result.profileIsPublic,
        isClaimed: result.profileIsClaimed,
        onboardingCompletedAt: result.profileOnboardingCompletedAt,
      }
    : null;

  if (!profile && requireProfile) {
    throw new Error('Profile not found');
  }

  return {
    clerkUserId,
    user,
    profile,
  };
}

/**
 * Get the current user's profile directly.
 * Convenience wrapper around getSessionContext for when you only need the profile.
 *
 * @param options.clerkUserId - Optional explicit Clerk user ID
 * @returns Profile or null if not found
 * @throws Error if user is not authenticated or user record not found
 */
export async function getCurrentUserProfile(options?: {
  clerkUserId?: string;
}): Promise<ProfileContext | null> {
  const { profile } = await getSessionContext({
    clerkUserId: options?.clerkUserId,
    requireUser: true,
    requireProfile: false,
  });
  return profile;
}

/**
 * Wrapper that provides session context to the operation.
 * Combines withDbSession with automatic user/profile lookup.
 *
 * @param operation - Function receiving session context
 * @param options.clerkUserId - Optional explicit Clerk user ID
 * @param options.requireProfile - If true, throws if profile not found
 */
export async function withSessionContext<T>(
  operation: (context: SessionContext) => Promise<T>,
  options?: { clerkUserId?: string; requireProfile?: boolean }
): Promise<T> {
  const context = await getSessionContext({
    clerkUserId: options?.clerkUserId,
    requireUser: true,
    requireProfile: options?.requireProfile,
  });

  // Set up RLS session
  await setupDbSession(context.clerkUserId);

  return await operation(context);
}
