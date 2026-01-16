import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { creatorProfiles, users, waitlistEntries } from '@/lib/db/schema';
import { captureCriticalError, captureError } from '@/lib/error-tracking';
import { normalizeEmail } from '@/lib/utils/email';
import { getCachedAuth, getCachedCurrentUser } from './cached';
import { syncEmailFromClerk } from './clerk-sync';

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

/**
 * Determines if a creator profile is considered "complete" for access purposes.
 * A complete profile has: username, display name, is public, and has completed onboarding.
 */
function isProfileComplete(profile: {
  username: string | null;
  usernameNormalized: string | null;
  displayName: string | null;
  isPublic: boolean | null;
  onboardingCompletedAt: Date | null;
}): boolean {
  const hasHandle =
    Boolean(profile.usernameNormalized) && Boolean(profile.username);
  const hasName = Boolean(profile.displayName?.trim());
  const isPublic = profile.isPublic !== false;
  const hasCompleted = Boolean(profile.onboardingCompletedAt);

  return hasHandle && hasName && isPublic && hasCompleted;
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

      // Derive userStatus based on actual user lifecycle state
      // This implements the proper state progression defined in migration 0034:
      // waitlist_pending → waitlist_approved → profile_claimed → onboarding_incomplete → active
      let userStatus:
        | 'waitlist_pending'
        | 'waitlist_approved'
        | 'profile_claimed'
        | 'onboarding_incomplete'
        | 'active';

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

      if (!waitlistEntryId) {
        // User just signed up but hasn't joined waitlist yet
        userStatus = 'waitlist_pending';
      } else if (
        existingUserData?.profileId &&
        existingUserData.profileClaimed
      ) {
        // User has a claimed profile (linked on admin approval)
        // Profile is auto-created on waitlist submission and linked on approval
        // Onboarding is skipped (onboardingCompletedAt set on approval), so user is active
        if (existingUserData.onboardingComplete) {
          userStatus = 'active';
        } else {
          userStatus = 'onboarding_incomplete';
        }
      } else {
        // User has waitlist entry but no claimed profile yet
        userStatus = 'waitlist_approved';
      }

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
            email,
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
      await captureError(
        `User creation failed (attempt ${attempt + 1}/${maxRetries})`,
        lastError,
        {
          clerkUserId,
          email,
          attempt: attempt + 1,
          maxRetries,
          operation: 'createUserWithRetry',
        }
      );

      // Don't retry on constraint violations or permanent errors
      if (
        lastError.message?.includes('duplicate key') ||
        lastError.message?.includes('constraint')
      ) {
        break;
      }
    }
  }

  await captureCriticalError(
    `User creation failed after ${maxRetries} attempts`,
    lastError,
    {
      clerkUserId,
      email,
      maxRetries,
      operation: 'createUserWithRetry',
    }
  );
  return null;
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

  // 1. Check Clerk authentication
  const { userId: clerkUserId } = await getCachedAuth();
  if (!clerkUserId) {
    return emptyResult;
  }

  // Get email from Clerk user
  const clerkUser = await getCachedCurrentUser();
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress ?? null;

  // 2. Query DB user by clerk_id
  const [dbUser] = await db
    .select({
      id: users.id,
      email: users.email,
      userStatus: users.userStatus,
      isAdmin: users.isAdmin,
      isPro: users.isPro,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

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
      console.warn('[gate] Email sync failed:', err);
    });
  }

  // Handle soft-deleted users
  if (dbUser?.deletedAt) {
    return {
      state: UserState.BANNED,
      clerkUserId,
      dbUserId: dbUser.id,
      profileId: null,
      redirectTo: '/banned',
      context: baseContext,
    };
  }

  // Handle explicitly banned or suspended users
  if (dbUser?.userStatus === 'banned' || dbUser?.userStatus === 'suspended') {
    return {
      state: UserState.BANNED,
      clerkUserId,
      dbUserId: dbUser.id,
      profileId: null,
      redirectTo: '/banned',
      context: baseContext,
    };
  }

  // 2b. If no DB user exists, create one if requested
  let dbUserId: string | null = dbUser?.id ?? null;

  if (!dbUserId) {
    if (createDbUserIfMissing) {
      if (!email) {
        await captureError(
          'Cannot create user without email',
          new Error('Email is required for user creation'),
          {
            clerkUserId,
            operation: 'resolveUserState',
          }
        );
        throw new Error('Email is required for user creation');
      }

      // Check waitlist status before creating user
      const waitlistResult = await checkWaitlistAccessInternal(email);

      if (waitlistResult.status === 'new' || !waitlistResult.status) {
        // Not on waitlist or still in application review - need to submit
        return {
          state: UserState.NEEDS_WAITLIST_SUBMISSION,
          clerkUserId,
          dbUserId: null,
          profileId: null,
          redirectTo: '/waitlist',
          context: { ...baseContext, email },
        };
      }

      // User is claimed (profile already linked on approval)
      // Profile is auto-created on waitlist submission and linked on approval
      // Onboarding is skipped, so user just needs DB user row to access the app
      dbUserId = await createUserWithRetry(
        clerkUserId,
        email,
        waitlistResult.entryId ?? undefined
      );

      if (!dbUserId) {
        // Capture to Sentry for monitoring
        await captureCriticalError(
          'User creation failed after retries',
          new Error('User creation failed after maximum retry attempts'),
          {
            clerkUserId,
            email,
            waitlistEntryId: waitlistResult.entryId,
            context: 'resolveUserState',
          }
        );

        return {
          state: UserState.USER_CREATION_FAILED,
          clerkUserId,
          dbUserId: null,
          profileId: null,
          redirectTo: '/error/user-creation-failed',
          context: {
            ...baseContext,
            email,
            errorCode: 'USER_CREATION_FAILED',
          },
        };
      }
    } else if (!createDbUserIfMissing) {
      return {
        state: UserState.NEEDS_DB_USER,
        clerkUserId,
        dbUserId: null,
        profileId: null,
        redirectTo: '/onboarding?fresh_signup=true',
        context: { ...baseContext, email },
      };
    } else {
      // No email available - send to waitlist
      return {
        state: UserState.NEEDS_WAITLIST_SUBMISSION,
        clerkUserId,
        dbUserId: null,
        profileId: null,
        redirectTo: '/waitlist',
        context: baseContext,
      };
    }
  }

  // 3. Query creator profile first to determine if user is mid-onboarding
  // We need to check this before waitlist logic to avoid redirect loops
  // for users who just signed up via OAuth and are completing onboarding
  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      username: creatorProfiles.username,
      usernameNormalized: creatorProfiles.usernameNormalized,
      displayName: creatorProfiles.displayName,
      isPublic: creatorProfiles.isPublic,
      onboardingCompletedAt: creatorProfiles.onboardingCompletedAt,
      isClaimed: creatorProfiles.isClaimed,
    })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.userId, dbUserId),
        eq(creatorProfiles.isClaimed, true)
      )
    )
    .limit(1);

  // No profile or incomplete profile
  if (!profile) {
    return {
      state: UserState.NEEDS_ONBOARDING,
      clerkUserId,
      dbUserId,
      profileId: null,
      redirectTo: '/onboarding?fresh_signup=true',
      context: { ...baseContext, email },
    };
  }

  // Profile exists but is incomplete
  if (!isProfileComplete(profile)) {
    return {
      state: UserState.NEEDS_ONBOARDING,
      clerkUserId,
      dbUserId,
      profileId: profile.id,
      redirectTo: '/onboarding?fresh_signup=true',
      context: { ...baseContext, email },
    };
  }

  // 5. Fully active user
  return {
    state: UserState.ACTIVE,
    clerkUserId,
    dbUserId,
    profileId: profile.id,
    redirectTo: null,
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
 * Returns redirect paths for each user state.
 * Used by routes to determine where to redirect users based on their state.
 */
export function getRedirectForState(state: UserState): string | null {
  switch (state) {
    case UserState.UNAUTHENTICATED:
      return '/signin';
    case UserState.NEEDS_DB_USER:
      return '/onboarding?fresh_signup=true';
    case UserState.NEEDS_WAITLIST_SUBMISSION:
      return '/waitlist';
    case UserState.WAITLIST_PENDING:
      return '/waitlist';
    case UserState.NEEDS_ONBOARDING:
      return '/onboarding?fresh_signup=true';
    case UserState.BANNED:
      return '/banned';
    case UserState.USER_CREATION_FAILED:
      return '/error/user-creation-failed';
    case UserState.ACTIVE:
      return null;
    default:
      return null;
  }
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
