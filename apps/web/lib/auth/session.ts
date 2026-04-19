import 'server-only';

import { sql as drizzleSql, eq } from 'drizzle-orm';
import { getCachedAuth } from '@/lib/auth/cached';
import { type DbOrTransaction, db } from '@/lib/db';
import { logDbError, logDbInfo, withRetry } from '@/lib/db/client';
import { runLegacyDbTransaction } from '@/lib/db/legacy-transaction';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';

/** Shared error messages for auth/profile resolution. Used by route guards. */
export const SESSION_ERRORS = {
  USER_NOT_FOUND: 'User not found',
  PROFILE_NOT_FOUND: 'Profile not found',
  UNAUTHORIZED: 'Unauthorized',
} as const;

export class UnauthorizedSessionError extends Error {
  constructor() {
    super(SESSION_ERRORS.UNAUTHORIZED);
    this.name = 'UnauthorizedSessionError';
  }
}

export function isUnauthorizedSessionError(error: unknown): boolean {
  return (
    error instanceof UnauthorizedSessionError ||
    (error instanceof Error && error.message === SESSION_ERRORS.UNAUTHORIZED)
  );
}

/**
 * Validates that a userId is a safe Clerk ID format
 * Clerk IDs follow the pattern: user_[a-zA-Z0-9]+
 */
export function validateClerkUserId(userId: string): void {
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new TypeError('User ID must be a non-empty string');
  }

  // Clerk user IDs are alphanumeric with underscores, typically starting with 'user_'
  const clerkIdPattern = /^[a-zA-Z0-9_-]+$/;
  if (!clerkIdPattern.test(userId)) {
    throw new TypeError('Invalid user ID format');
  }
  if (userId.length > 255) {
    throw new TypeError('User ID too long');
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
    throw new UnauthorizedSessionError();
  }

  // Validate userId format to prevent SQL injection
  validateClerkUserId(userId);
  return userId;
}

/**
 * Gets the SQL statement for setting up RLS session variables.
 * This allows the session setup to be batched with other queries.
 *
 * @param userId - The Clerk user ID (already validated)
 * @returns SQL statement that sets RLS session variable(s)
 */
export function getSessionSetupSql(userId: string) {
  validateClerkUserId(userId);

  // Set the Clerk session variable for RLS using transaction-local scope.
  // is_local=true ensures the variable is scoped to the current transaction,
  // preventing cross-request RLS session bleed in pooled connections.
  return drizzleSql`SELECT set_config('app.clerk_user_id', ${userId}, true)`;
}

export async function setTransactionSessionUserId(
  tx: DbOrTransaction,
  userId: string,
  context: string
): Promise<void> {
  try {
    await tx.execute(getSessionSetupSql(userId));
  } catch (error) {
    logDbError(context, error, { userId });
    throw error;
  }
}

async function applySessionUserId(userId: string): Promise<void> {
  // setupDbSession is used outside explicit transaction boundaries.
  // Use session-scoped set_config (is_local=false) directly to avoid
  // emitting avoidable query errors for transaction-local scope.
  await db.execute(
    drizzleSql`SELECT set_config('app.clerk_user_id', ${userId}, false)`
  );
}

/**
 * Sets up the database session for the authenticated user
 * This enables RLS policies to work properly with Clerk user ID
 *
 * Uses session-scoped `set_config` calls and retry logic.
 * Avoid introducing new transaction usage in app code; keep legacy
 * transaction wrappers isolated in `lib/db/legacy-transaction.ts`.
 */
export async function setupDbSession(clerkUserId?: string) {
  let userId: string;
  try {
    userId = await resolveClerkUserId(clerkUserId);
  } catch (error) {
    // If no authenticated user, skip RLS setup gracefully
    if (isUnauthorizedSessionError(error)) {
      logDbInfo('setupDbSession', 'Skipping RLS setup — no authenticated user');
      return { userId: null };
    }
    throw error;
  }

  try {
    // Execute the session setup SQL with retry logic for transient failures
    await withRetry(async () => {
      await applySessionUserId(userId);
    }, 'setupDbSession');

    logDbInfo('setupDbSession', 'Session setup completed successfully', {
      userId,
    });

    return { userId };
  } catch (error) {
    logDbError('setupDbSession', error, { userId });
    throw error;
  }
}

/**
 * Wrapper function to run database operations with proper session setup
 */
export async function withDbSession<T>(
  operation: (userId: string) => Promise<T>,
  options?: { clerkUserId?: string }
): Promise<T> {
  const { userId } = await setupDbSession(options?.clerkUserId);
  if (!userId) {
    throw new UnauthorizedSessionError();
  }
  return operation(userId);
}

/**
 * Transaction isolation levels supported by PostgreSQL
 */
export type IsolationLevel =
  | 'read committed'
  | 'read uncommitted'
  | 'repeatable read'
  | 'serializable';

/**
 * Run DB operations with RLS session variables set.
 * Sets app.clerk_user_id via session-scoped set_config
 * before executing the operation.
 *
 * @param operation The callback to execute with the transaction
 * @param options Optional Clerk user ID and isolation level override
 * @returns The result of the operation
 */
export async function withDbSessionTx<T>(
  operation: (tx: DbOrTransaction, userId: string) => Promise<T>,
  options?: { clerkUserId?: string; isolationLevel?: IsolationLevel }
): Promise<T> {
  const userId = await resolveClerkUserId(options?.clerkUserId);

  // Legacy exception: this path still requires transaction-scoped session state.
  // Keep usage centralized through runLegacyDbTransaction for auditability.
  return runLegacyDbTransaction(
    async tx => {
      // Set the session variable within the transaction.
      // Neon HTTP does not support SET LOCAL fallback outside a real transaction,
      // so fail closed if transaction-scoped session state cannot be set.
      await setTransactionSessionUserId(
        tx,
        userId,
        'withDbSessionTx_set_config_failed'
      );
      return operation(tx, userId);
    },
    options?.isolationLevel
      ? { isolationLevel: options.isolationLevel }
      : undefined
  );
}

/**
 * Get the current user ID or throw if not authenticated
 */
export async function requireAuth() {
  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new UnauthorizedSessionError();
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
    .from(users)
    .innerJoin(creatorProfiles, eq(creatorProfiles.id, users.activeProfileId))
    .where(eq(users.id, dbUserId))
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
      profileUsername: creatorProfiles.username,
      profileUsernameNormalized: creatorProfiles.usernameNormalized,
      profileDisplayName: creatorProfiles.displayName,
      profileAvatarUrl: creatorProfiles.avatarUrl,
      profileIsPublic: creatorProfiles.isPublic,
      profileOnboardingCompletedAt: creatorProfiles.onboardingCompletedAt,
    })
    .from(users)
    .leftJoin(creatorProfiles, eq(creatorProfiles.id, users.activeProfileId))
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  // User not found
  if (!result && requireUser) {
    throw new TypeError(SESSION_ERRORS.USER_NOT_FOUND);
  }

  if (!result) {
    return {
      clerkUserId,
      user: null as unknown as DbUserContext,
      profile: null,
    };
  }

  // Build user context from result
  // Guard: users.id must be a UUID. If a Clerk ID leaked into the id column
  // (data issue), fail fast here instead of causing "invalid input syntax for
  // type uuid" errors in every downstream query (see JOVIE-WEB-HH).
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(result.userId)) {
    logDbError(
      'getSessionContext',
      new Error(
        `user.id is not a UUID: ${result.userId} (clerkId=${clerkUserId})`
      )
    );
    throw new TypeError(SESSION_ERRORS.USER_NOT_FOUND);
  }

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
        userId: result.userId, // from users table, not profile
        username: result.profileUsername,
        usernameNormalized: result.profileUsernameNormalized,
        displayName: result.profileDisplayName,
        avatarUrl: result.profileAvatarUrl,
        isPublic: result.profileIsPublic,
        isClaimed: true, // joined via activeProfileId = claimed
        onboardingCompletedAt: result.profileOnboardingCompletedAt,
      }
    : null;

  if (!profile && requireProfile) {
    throw new TypeError(SESSION_ERRORS.PROFILE_NOT_FOUND);
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

  await setupDbSession(context.clerkUserId);
  return operation(context);
}
