'server only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  creatorProfiles,
  users,
  waitlistEntries,
  waitlistInvites,
} from '@/lib/db/schema';
import { getCachedAuth, getCachedCurrentUser } from './cached';

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
  /** Waitlist application approved, needs to claim invite */
  WAITLIST_INVITED = 'WAITLIST_INVITED',
  /** User has access but needs to complete onboarding */
  NEEDS_ONBOARDING = 'NEEDS_ONBOARDING',
  /** Fully active user with complete profile */
  ACTIVE = 'ACTIVE',
  /** User has been banned */
  BANNED = 'BANNED',
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
    claimToken?: string;
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
 * @param options.claimToken - If provided, used for claim flow state resolution
 */
export async function resolveUserState(options?: {
  createDbUserIfMissing?: boolean;
  claimToken?: string;
}): Promise<AuthGateResult> {
  const { createDbUserIfMissing = true, claimToken } = options ?? {};

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
      status: users.status,
      isAdmin: users.isAdmin,
      isPro: users.isPro,
      deletedAt: users.deletedAt,
      waitlistEntryId: users.waitlistEntryId,
    })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  const baseContext = {
    isAdmin: dbUser?.isAdmin ?? false,
    isPro: dbUser?.isPro ?? false,
    email,
  };

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

  // Handle explicitly banned users
  if (dbUser?.status === 'banned') {
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
  let dbUserId = dbUser?.id ?? null;

  if (!dbUserId) {
    if (createDbUserIfMissing && email) {
      // Check waitlist status before creating user
      const waitlistResult = await checkWaitlistAccessInternal(email);

      if (
        waitlistResult.status === 'new' ||
        waitlistResult.status === 'rejected' ||
        !waitlistResult.status
      ) {
        // Not on waitlist or rejected - need to submit application
        return {
          state: UserState.NEEDS_WAITLIST_SUBMISSION,
          clerkUserId,
          dbUserId: null,
          profileId: null,
          redirectTo: '/waitlist',
          context: { ...baseContext, email },
        };
      }

      if (waitlistResult.status === 'invited' && waitlistResult.claimToken) {
        // Invited but hasn't claimed yet
        return {
          state: UserState.WAITLIST_INVITED,
          clerkUserId,
          dbUserId: null,
          profileId: null,
          redirectTo: `/claim/${encodeURIComponent(waitlistResult.claimToken)}`,
          context: {
            ...baseContext,
            email,
            claimToken: waitlistResult.claimToken,
          },
        };
      }

      // User is claimed or approved - create DB user
      const [createdUser] = await db
        .insert(users)
        .values({
          clerkId: clerkUserId,
          email,
          status: 'active',
          waitlistEntryId: waitlistResult.entryId ?? undefined,
        })
        .returning({ id: users.id });

      dbUserId = createdUser.id;
    } else if (!createDbUserIfMissing) {
      return {
        state: UserState.NEEDS_DB_USER,
        clerkUserId,
        dbUserId: null,
        profileId: null,
        redirectTo: '/onboarding',
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

  // 3. Check waitlist access for existing users without waitlist linkage
  // This handles users who existed before the waitlist system
  if (!dbUser?.waitlistEntryId && email) {
    const waitlistResult = await checkWaitlistAccessInternal(email);

    // If user has no waitlist entry and hasn't been approved, check their access
    if (waitlistResult.status === 'new') {
      return {
        state: UserState.WAITLIST_PENDING,
        clerkUserId,
        dbUserId,
        profileId: null,
        redirectTo: '/waitlist',
        context: { ...baseContext, email },
      };
    }

    if (waitlistResult.status === 'rejected') {
      return {
        state: UserState.NEEDS_WAITLIST_SUBMISSION,
        clerkUserId,
        dbUserId,
        profileId: null,
        redirectTo: '/waitlist',
        context: { ...baseContext, email },
      };
    }

    if (waitlistResult.status === 'invited' && waitlistResult.claimToken) {
      return {
        state: UserState.WAITLIST_INVITED,
        clerkUserId,
        dbUserId,
        profileId: null,
        redirectTo: `/claim/${encodeURIComponent(waitlistResult.claimToken)}`,
        context: {
          ...baseContext,
          email,
          claimToken: waitlistResult.claimToken,
        },
      };
    }
  }

  // 4. Query creator profile
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
      redirectTo: '/onboarding',
      context: { ...baseContext, email, claimToken },
    };
  }

  // Profile exists but is incomplete
  if (!isProfileComplete(profile)) {
    return {
      state: UserState.NEEDS_ONBOARDING,
      clerkUserId,
      dbUserId,
      profileId: profile.id,
      redirectTo: '/onboarding',
      context: { ...baseContext, email },
    };
  }

  // 5. Fully active user
  return {
    state: dbUser?.isAdmin ? UserState.ACTIVE : UserState.ACTIVE,
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

export type WaitlistStatus = 'new' | 'invited' | 'claimed' | 'rejected';

export interface WaitlistAccessResult {
  entryId: string | null;
  status: WaitlistStatus | null;
  claimToken: string | null;
}

/**
 * Check waitlist access by email.
 * Returns the waitlist entry status and claim token if available.
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
  status: 'new' | 'invited' | 'claimed' | 'rejected' | null;
  claimToken: string | null;
}> {
  const normalizedEmail = email.trim().toLowerCase();

  const [entry] = await db
    .select({
      id: waitlistEntries.id,
      status: waitlistEntries.status,
    })
    .from(waitlistEntries)
    .where(eq(waitlistEntries.email, normalizedEmail))
    .limit(1);

  if (!entry) {
    return { entryId: null, status: null, claimToken: null };
  }

  // If invited, get the claim token
  if (entry.status === 'invited') {
    const [invite] = await db
      .select({ claimToken: waitlistInvites.claimToken })
      .from(waitlistInvites)
      .where(eq(waitlistInvites.waitlistEntryId, entry.id))
      .limit(1);

    return {
      entryId: entry.id,
      status: entry.status,
      claimToken: invite?.claimToken ?? null,
    };
  }

  return {
    entryId: entry.id,
    status: entry.status,
    claimToken: null,
  };
}

/**
 * Get waitlist invite details by claim token.
 * Returns the waitlist entry ID and email if the token is valid.
 */
export async function getWaitlistInviteByToken(token: string): Promise<{
  waitlistEntryId: string;
  email: string;
  claimToken: string;
} | null> {
  const [invite] = await db
    .select({
      waitlistEntryId: waitlistInvites.waitlistEntryId,
      email: waitlistInvites.email,
      claimToken: waitlistInvites.claimToken,
    })
    .from(waitlistInvites)
    .where(eq(waitlistInvites.claimToken, token))
    .limit(1);

  return invite ?? null;
}

// =============================================================================
// State Utilities
// =============================================================================

/**
 * Returns redirect paths for each user state.
 * Used by routes to determine where to redirect users based on their state.
 */
export function getRedirectForState(
  state: UserState,
  claimToken?: string
): string | null {
  switch (state) {
    case UserState.UNAUTHENTICATED:
      return '/signin';
    case UserState.NEEDS_DB_USER:
      return '/onboarding';
    case UserState.NEEDS_WAITLIST_SUBMISSION:
      return '/waitlist';
    case UserState.WAITLIST_PENDING:
      return '/waitlist';
    case UserState.WAITLIST_INVITED:
      return claimToken
        ? `/claim/${encodeURIComponent(claimToken)}`
        : '/waitlist';
    case UserState.NEEDS_ONBOARDING:
      return '/onboarding';
    case UserState.BANNED:
      return '/banned';
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
