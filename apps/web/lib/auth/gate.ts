import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { captureCriticalError, captureError } from '@/lib/error-tracking';
import { normalizeEmail } from '@/lib/utils/email';
import { getCachedAuth, getCachedCurrentUser } from './cached';
import { syncEmailFromClerk } from './clerk-sync';
// eslint-disable-next-line import/no-cycle -- intentional auth module structure
import { resolveProfileState } from './profile-state-resolver';
// eslint-disable-next-line import/no-cycle -- intentional auth module structure
import { checkUserStatus } from './status-checker';
import { isWaitlistEnabled } from './waitlist-config';

/**
 * Centralized user state enum for auth gating decisions.
 *
 * This replaces scattered auth checks throughout the codebase with a single
 * source of truth for user state resolution. Each state has a clear redirect
 * destination and guards users from accessing features they shouldn't.
 */
export enum UserState {
  /** No authenticated session */
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  /** Clerk user exists but no DB user row yet */
  NEEDS_DB_USER = 'NEEDS_DB_USER',
  /** User needs to submit waitlist application */
  NEEDS_WAITLIST_SUBMISSION = 'NEEDS_WAITLIST_SUBMISSION',
  /** Waitlist application submitted but not yet approved */
  WAITLIST_PENDING = 'WAITLIST_PENDING',
  /** User has access but needs to complete onboarding */
  NEEDS_ONBOARDING = 'NEEDS_ONBOARDING',
  /** Fully active user with complete profile */
  ACTIVE = 'ACTIVE',
  /** User has been banned */
  BANNED = 'BANNED',
  /** User creation failed after retries - prevents redirect loops */
  USER_CREATION_FAILED = 'USER_CREATION_FAILED',
}

/**
 * Result of resolving user state. Contains all information needed
 * to make auth gating decisions and redirect users appropriately.
 */
export interface AuthGateResult {
  /** The resolved user state */
  state: UserState;
  /** Clerk user ID if authenticated */
  clerkUserId: string | null;
  /** Database user ID if exists */
  dbUserId: string | null;
  /** Creator profile ID if exists */
  profileId: string | null;
  /** Suggested redirect path based on state, or null if no redirect needed */
  redirectTo: string | null;
  /** Additional context for the caller */
  context: {
    isAdmin: boolean;
    isPro: boolean;
    email: string | null;
    errorCode?: string;
  };
}

/** User status type alias for user lifecycle states */
type UserLifecycleStatus =
  | 'waitlist_pending'
  | 'waitlist_approved'
  | 'profile_claimed'
  | 'onboarding_incomplete'
  | 'active';

/** Data structure for existing user profile information */
interface ExistingUserData {
  profileId: string | null;
  profileClaimed: boolean | null;
  onboardingComplete: Date | null;
}

/**
 * Determine user status based on waitlist entry and profile state.
 * Implements the state progression: waitlist_pending → waitlist_approved → active
 */
function determineUserStatus(
  waitlistEntryId: string | undefined,
  existingUserData: ExistingUserData | undefined
): UserLifecycleStatus {
  if (!waitlistEntryId) {
    // When waitlist is disabled, skip waitlist states — treat as approved
    if (!isWaitlistEnabled()) {
      const hasClaimedProfile =
        existingUserData?.profileId && existingUserData.profileClaimed;
      if (!hasClaimedProfile) {
        return 'waitlist_approved';
      }
      return existingUserData.onboardingComplete
        ? 'active'
        : 'onboarding_incomplete';
    }
    return 'waitlist_pending';
  }

  const hasClaimedProfile =
    existingUserData?.profileId && existingUserData.profileClaimed;
  if (!hasClaimedProfile) {
    return 'waitlist_approved';
  }

  return existingUserData.onboardingComplete
    ? 'active'
    : 'onboarding_incomplete';
}

/**
 * Check if an error is a permanent error that should not be retried.
 */
function isPermanentError(error: Error): boolean {
  return (
    error.message?.includes('duplicate key') ||
    error.message?.includes('constraint')
  );
}

/**
 * Helper function to create a DB user with exponential backoff retry logic.
 *
 * Handles transient database errors that might occur during the Clerk
 * session propagation window after OTP verification.
 *
 * @param clerkUserId - The Clerk user ID
 * @param email - User's email address
 * @param waitlistEntryId - Optional waitlist entry ID
 * @param maxRetries - Maximum retry attempts (default: 3)
 * @returns Created/updated user ID or null if all retries fail
 */
async function createUserWithRetry(
  clerkUserId: string,
  email: string | null,
  waitlistEntryId: string | undefined,
  maxRetries = 3
): Promise<string | null> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Exponential backoff: 0ms, 1000ms, 2000ms
      if (attempt > 0) {
        const delay = Math.min(1000 * attempt, 3000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // Check if user already has an existing DB record with a claimed profile
      const [existingUserData] = await db
        .select({
          userId: users.id,
          currentStatus: users.userStatus,
          profileId: creatorProfiles.id,
          profileClaimed: creatorProfiles.isClaimed,
          onboardingComplete: creatorProfiles.onboardingCompletedAt,
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

      const userStatus = determineUserStatus(waitlistEntryId, existingUserData);

      const [createdUser] = await db
        .insert(users)
        .values({
          clerkId: clerkUserId,
          email,
          userStatus,
          waitlistEntryId, // Keep for historical tracking only
        })
        .onConflictDoUpdate({
          target: users.clerkId,
          set: {
            // Only overwrite email if a new value is provided — prevents
            // nulling out an existing email when Clerk hasn't propagated yet
            ...(email ? { email } : {}),
            userStatus,
            updatedAt: new Date(),
          },
        })
        .returning({ id: users.id });

      if (!createdUser?.id) {
        throw new Error('Failed to create or retrieve user');
      }

      return createdUser.id;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      // Extract database-specific error details for better diagnostics
      const dbErrorCode = (error as { code?: string })?.code;
      const dbConstraint = (error as { constraint?: string })?.constraint;
      const dbDetail = (error as { detail?: string })?.detail;
      // Include key details in the message string because RSC console
      // forwarding serialises the context object as `{}`
      const errorSummary = [
        lastError.message,
        dbErrorCode && `code=${dbErrorCode}`,
        dbConstraint && `constraint=${dbConstraint}`,
        dbDetail && `detail=${dbDetail}`,
      ]
        .filter(Boolean)
        .join(', ');
      await captureError(
        `User creation failed (attempt ${attempt + 1}/${maxRetries}): ${errorSummary}`,
        lastError,
        {
          clerkUserId,
          email,
          attempt: attempt + 1,
          maxRetries,
          operation: 'createUserWithRetry',
          errorType: lastError.constructor?.name ?? 'unknown',
          dbErrorCode,
          dbConstraint,
          dbDetail,
        }
      );

      if (isPermanentError(lastError)) {
        break;
      }
    }
  }

  const dbErrorCode = (lastError as unknown as { code?: string })?.code;
  await captureCriticalError(
    `User creation failed after ${maxRetries} attempts`,
    lastError,
    {
      clerkUserId,
      email,
      maxRetries,
      operation: 'createUserWithRetry',
      errorMessage: lastError?.message,
      errorType: lastError?.constructor?.name ?? 'unknown',
      dbErrorCode,
    }
  );
  return null;
}

/** Context for handling missing DB user scenarios */
interface MissingDbUserContext {
  createDbUserIfMissing: boolean;
  clerkUserId: string;
  email: string | null;
  baseContext: { isAdmin: boolean; isPro: boolean; email: string | null };
}

/**
 * Handle the case where no DB user exists for an authenticated Clerk user.
 * Returns either a complete AuthGateResult (for early return) or the new user ID.
 */
async function handleMissingDbUser(
  ctx: MissingDbUserContext
): Promise<AuthGateResult | { dbUserId: string }> {
  const { createDbUserIfMissing, clerkUserId, email, baseContext } = ctx;

  // Don't create user - return NEEDS_DB_USER state
  if (!createDbUserIfMissing) {
    return {
      state: UserState.NEEDS_DB_USER,
      clerkUserId,
      dbUserId: null,
      profileId: null,
      redirectTo: '/onboarding?fresh_signup=true',
      context: { ...baseContext, email },
    };
  }

  // Need email to proceed
  if (!email) {
    await captureError(
      'Cannot create user without email',
      new TypeError('Email is required for user creation'),
      { clerkUserId, operation: 'resolveUserState' }
    );
    throw new TypeError('Email is required for user creation');
  }

  // Check waitlist status before creating user (only when waitlist is enabled)
  let waitlistEntryId: string | undefined;

  if (isWaitlistEnabled()) {
    const waitlistResult = await checkWaitlistAccessInternal(email);

    if (waitlistResult.status === 'new' || !waitlistResult.status) {
      return {
        state: UserState.NEEDS_WAITLIST_SUBMISSION,
        clerkUserId,
        dbUserId: null,
        profileId: null,
        redirectTo: '/waitlist',
        context: { ...baseContext, email },
      };
    }

    waitlistEntryId = waitlistResult.entryId ?? undefined;
  }

  // Create the user (without waitlist entry when waitlist is disabled)
  const newUserId = await createUserWithRetry(
    clerkUserId,
    email,
    waitlistEntryId
  );

  if (!newUserId) {
    await captureCriticalError(
      'User creation failed after retries',
      new Error('User creation failed after maximum retry attempts'),
      {
        clerkUserId,
        email,
        waitlistEntryId,
        context: 'resolveUserState',
      }
    );

    return {
      state: UserState.USER_CREATION_FAILED,
      clerkUserId,
      dbUserId: null,
      profileId: null,
      redirectTo: '/error/user-creation-failed',
      context: { ...baseContext, email, errorCode: 'USER_CREATION_FAILED' },
    };
  }

  return { dbUserId: newUserId };
}

/**
 * Centralized auth gate function that resolves the current user's state.
 *
 * This is the single source of truth for auth state resolution. It replaces
 * scattered auth checks in layout.tsx, onboarding/page.tsx, and claim/[token]/page.tsx.
 *
 * Resolution order:
 * 1. Check Clerk authentication → UNAUTHENTICATED
 * 2. Check DB user existence → NEEDS_DB_USER (auto-creates)
 * 3. Check user status → BANNED
 * 4. Check waitlist/profile state → WAITLIST_*, NEEDS_ONBOARDING, ACTIVE
 *
 * @param options.createDbUserIfMissing - If true, creates a DB user row when missing (default: true)
 */
export async function resolveUserState(
  options: { createDbUserIfMissing?: boolean } = {}
): Promise<AuthGateResult> {
  const { createDbUserIfMissing = true } = options;

  // Default empty result
  const emptyResult: AuthGateResult = {
    state: UserState.UNAUTHENTICATED,
    clerkUserId: null,
    dbUserId: null,
    profileId: null,
    redirectTo: '/signin',
    context: {
      isAdmin: false,
      isPro: false,
      email: null,
    },
  };

  // 1. Check Clerk authentication (parallelize both calls for performance)
  const [authResult, clerkUser] = await Promise.all([
    getCachedAuth(),
    getCachedCurrentUser(),
  ]);

  const { userId: clerkUserId } = authResult;
  if (!clerkUserId) {
    return emptyResult;
  }

  // Get email from Clerk user
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress ?? null;

  // 2. Query DB user AND profile in a single JOIN query (performance optimization)
  // This reduces database round trips from 2 to 1
  const [dbResult] = await db
    .select({
      // User fields
      id: users.id,
      email: users.email,
      userStatus: users.userStatus,
      isAdmin: users.isAdmin,
      isPro: users.isPro,
      deletedAt: users.deletedAt,
      // Profile fields (nullable from LEFT JOIN)
      profileId: creatorProfiles.id,
      profileUsername: creatorProfiles.username,
      profileUsernameNormalized: creatorProfiles.usernameNormalized,
      profileDisplayName: creatorProfiles.displayName,
      profileIsPublic: creatorProfiles.isPublic,
      profileOnboardingCompletedAt: creatorProfiles.onboardingCompletedAt,
      profileIsClaimed: creatorProfiles.isClaimed,
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

  // Extract user data from result (may be undefined if no user exists)
  const dbUser = dbResult
    ? {
        id: dbResult.id,
        email: dbResult.email,
        userStatus: dbResult.userStatus,
        isAdmin: dbResult.isAdmin,
        isPro: dbResult.isPro,
        deletedAt: dbResult.deletedAt,
      }
    : null;

  const baseContext = {
    isAdmin: dbUser?.isAdmin ?? false,
    isPro: dbUser?.isPro ?? false,
    email,
  };

  // Sync email from Clerk if different (Clerk is source of truth for identity)
  // Only sync verified emails to prevent hijacking
  const verifiedClerkEmail = clerkUser?.emailAddresses?.find(
    e => e.verification?.status === 'verified'
  )?.emailAddress;

  if (dbUser && verifiedClerkEmail && dbUser.email !== verifiedClerkEmail) {
    // Best-effort sync - don't block auth on sync failure
    await syncEmailFromClerk(dbUser.id, verifiedClerkEmail).catch(err => {
      Sentry.addBreadcrumb({
        category: 'auth-gate',
        message: 'Email sync failed',
        level: 'warning',
        data: {
          error: err instanceof Error ? err.message : String(err),
          userId: dbUser.id,
        },
      });
    });
  }

  // Check if user is blocked (banned, suspended, or deleted)
  const statusCheck = checkUserStatus(
    dbUser?.userStatus ?? null,
    dbUser?.deletedAt ?? null
  );
  if (statusCheck.isBlocked && statusCheck.blockedState) {
    return {
      state: statusCheck.blockedState,
      clerkUserId,
      dbUserId: dbUser?.id ?? null,
      profileId: null,
      redirectTo: statusCheck.redirectTo,
      context: baseContext,
    };
  }

  // 2b. If no DB user exists, create one if requested
  let dbUserId: string | null = dbUser?.id ?? null;

  // Profile from the JOIN query (only valid if dbUser exists)
  let profile = dbResult?.profileId
    ? {
        id: dbResult.profileId,
        username: dbResult.profileUsername,
        usernameNormalized: dbResult.profileUsernameNormalized,
        displayName: dbResult.profileDisplayName,
        isPublic: dbResult.profileIsPublic,
        onboardingCompletedAt: dbResult.profileOnboardingCompletedAt,
        isClaimed: dbResult.profileIsClaimed,
      }
    : null;

  if (!dbUserId) {
    const creationResult = await handleMissingDbUser({
      createDbUserIfMissing,
      clerkUserId,
      email,
      baseContext,
    });

    // If creationResult is a full AuthGateResult, return it early
    if ('state' in creationResult) {
      return creationResult;
    }

    // Otherwise, we got the new user ID
    dbUserId = creationResult.dbUserId;
    // New user won't have a profile yet
    profile = null;
  }

  // Resolve user state based on profile status
  const profileState = resolveProfileState(profile);

  return {
    state: profileState.state,
    clerkUserId,
    dbUserId,
    profileId: profileState.profileId,
    redirectTo: profileState.redirectTo,
    context: {
      isAdmin: dbUser?.isAdmin ?? false,
      isPro: dbUser?.isPro ?? false,
      email,
    },
  };
}

// =============================================================================
// Waitlist Access Helpers (exported for reuse)
// =============================================================================

// Valid waitlist statuses: 'new' (submitted), 'claimed' (approved).
export type WaitlistStatus = 'new' | 'claimed';

export interface WaitlistAccessResult {
  entryId: string | null;
  status: WaitlistStatus | null;
}

/**
 * Check waitlist access by email.
 * Returns the waitlist entry status.
 *
 * This is the single source of truth for waitlist status checks.
 * Use this instead of querying waitlist tables directly.
 */
export async function getWaitlistAccess(
  email: string
): Promise<WaitlistAccessResult> {
  return checkWaitlistAccessInternal(email);
}

/**
 * Internal helper to check waitlist access by email.
 */
async function checkWaitlistAccessInternal(email: string): Promise<{
  entryId: string | null;
  status: 'new' | 'claimed' | null;
}> {
  const normalizedEmail = normalizeEmail(email);

  const [entry] = await db
    .select({
      id: waitlistEntries.id,
      status: waitlistEntries.status,
    })
    .from(waitlistEntries)
    .where(eq(waitlistEntries.email, normalizedEmail))
    .limit(1);

  if (!entry) {
    return { entryId: null, status: null };
  }

  return {
    entryId: entry.id,
    status: entry.status as 'new' | 'claimed',
  };
}

// =============================================================================
// State Utilities
// =============================================================================

/**
 * Lookup map for user state redirects.
 */
const STATE_REDIRECT_MAP: Record<UserState, string | null> = {
  [UserState.UNAUTHENTICATED]: '/signin',
  [UserState.NEEDS_DB_USER]: '/onboarding?fresh_signup=true',
  [UserState.NEEDS_WAITLIST_SUBMISSION]: '/waitlist',
  [UserState.WAITLIST_PENDING]: '/waitlist',
  [UserState.NEEDS_ONBOARDING]: '/onboarding?fresh_signup=true',
  [UserState.BANNED]: '/banned',
  [UserState.USER_CREATION_FAILED]: '/error/user-creation-failed',
  [UserState.ACTIVE]: null,
};

/**
 * Returns redirect paths for each user state.
 * Used by routes to determine where to redirect users based on their state.
 */
export function getRedirectForState(state: UserState): string | null {
  return STATE_REDIRECT_MAP[state] ?? null;
}

/**
 * Utility to check if a state allows access to the main app.
 */
export function canAccessApp(state: UserState): boolean {
  return state === UserState.ACTIVE;
}

/**
 * Utility to check if a state allows access to onboarding.
 */
export function canAccessOnboarding(state: UserState): boolean {
  return state === UserState.NEEDS_ONBOARDING || state === UserState.ACTIVE;
}

/**
 * Utility to check if a state requires redirect away from protected routes.
 */
export function requiresRedirect(state: UserState): boolean {
  return state !== UserState.ACTIVE;
}
