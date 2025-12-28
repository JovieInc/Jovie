import 'server-only';

import { eq, and, isNull } from 'drizzle-orm';
import { cache } from 'react';
import { db } from '@/lib/db';
import {
  users,
  creatorProfiles,
  waitlistEntries,
  waitlistInvites,
  type UserStatus,
} from '@/lib/db/schema';
import { getCachedAuth, getCachedCurrentUser } from './cached';
import { isAdmin } from '@/lib/admin/roles';

/**
 * User lifecycle states for the centralized auth gate.
 *
 * This enum represents all possible states a user can be in within
 * the Jovie application lifecycle.
 */
export enum UserState {
  /** User is not authenticated (no Clerk session) */
  UNAUTHENTICATED = 'UNAUTHENTICATED',

  /** Clerk user exists but no DB user row yet - needs provisioning */
  NEEDS_DB_USER = 'NEEDS_DB_USER',

  /** User needs to submit waitlist form */
  NEEDS_WAITLIST_SUBMISSION = 'NEEDS_WAITLIST_SUBMISSION',

  /** User has submitted waitlist, awaiting approval */
  WAITLIST_PENDING = 'WAITLIST_PENDING',

  /** User has been invited - needs to claim profile */
  WAITLIST_INVITED = 'WAITLIST_INVITED',

  /** User has claimed profile but needs to complete onboarding */
  NEEDS_ONBOARDING = 'NEEDS_ONBOARDING',

  /** User is fully active with completed profile */
  ACTIVE = 'ACTIVE',

  /** User account is banned */
  BANNED = 'BANNED',

  /** User account is deactivated (soft-deleted) */
  DEACTIVATED = 'DEACTIVATED',
}

/**
 * Result of the centralized auth gate resolution.
 */
export interface AuthGateResult {
  /** Current user lifecycle state */
  state: UserState;

  /** Clerk user ID (null if unauthenticated) */
  clerkUserId: string | null;

  /** Database user ID (null if no DB user) */
  dbUserId: string | null;

  /** Primary profile ID (null if no profile) */
  profileId: string | null;

  /** Recommended redirect path (null if no redirect needed) */
  redirectTo: string | null;

  /** Additional context for the current state */
  context: {
    /** Whether user has admin privileges */
    isAdmin: boolean;

    /** Whether user has pro subscription */
    isPro: boolean;

    /** Claim token for invited users */
    claimToken?: string;

    /** User's email from Clerk */
    email?: string;

    /** User's display name */
    displayName?: string;

    /** Waitlist entry status */
    waitlistStatus?: 'new' | 'invited' | 'claimed' | 'rejected';

    /** User account status */
    userStatus?: UserStatus;

    /** Profile username for redirects */
    username?: string;
  };
}

/**
 * Internal type for DB user query result
 */
interface DbUserRow {
  id: string;
  status: UserStatus;
  isAdmin: boolean;
  isPro: boolean | null;
  deletedAt: Date | null;
  waitlistEntryId: string | null;
}

/**
 * Internal type for profile query result
 */
interface ProfileRow {
  id: string;
  isPrimary: boolean;
  isClaimed: boolean;
  username: string;
  displayName: string | null;
  onboardingCompletedAt: Date | null;
}

/**
 * Internal type for waitlist entry query result
 */
interface WaitlistRow {
  id: string;
  status: 'new' | 'invited' | 'claimed' | 'rejected';
}

/**
 * Internal type for waitlist invite query result
 */
interface WaitlistInviteRow {
  claimToken: string;
  status: 'pending' | 'sending' | 'sent' | 'failed';
}

/**
 * Resolves the current user's lifecycle state.
 *
 * This is the single source of truth for all routing and access control
 * decisions in the application. All pages and layouts should use this
 * function instead of implementing their own auth checks.
 *
 * The function is cached per-request to avoid redundant database queries.
 *
 * @param options.clerkUserId - Optional override for Clerk user ID (for testing)
 * @returns AuthGateResult with state, IDs, redirect path, and context
 *
 * @example
 * ```ts
 * const gate = await resolveUserState();
 *
 * if (gate.state === UserState.UNAUTHENTICATED) {
 *   redirect('/signin');
 * }
 *
 * if (gate.redirectTo) {
 *   redirect(gate.redirectTo);
 * }
 * ```
 */
export const resolveUserState = cache(
  async (options?: { clerkUserId?: string }): Promise<AuthGateResult> => {
    // Step 1: Get Clerk authentication
    const { userId: authUserId } = await getCachedAuth();
    const clerkUserId = options?.clerkUserId ?? authUserId;

    // Not authenticated
    if (!clerkUserId) {
      return {
        state: UserState.UNAUTHENTICATED,
        clerkUserId: null,
        dbUserId: null,
        profileId: null,
        redirectTo: '/signin',
        context: {
          isAdmin: false,
          isPro: false,
        },
      };
    }

    // Get Clerk user for email
    const clerkUser = await getCachedCurrentUser();
    const email =
      clerkUser?.primaryEmailAddress?.emailAddress ??
      clerkUser?.emailAddresses?.[0]?.emailAddress ??
      null;
    const displayName =
      clerkUser?.fullName ??
      clerkUser?.firstName ??
      clerkUser?.username ??
      null;

    // Step 2: Query DB user
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

    // Check for soft-deleted user
    if (dbUser?.deletedAt) {
      return {
        state: UserState.DEACTIVATED,
        clerkUserId,
        dbUserId: dbUser.id,
        profileId: null,
        redirectTo: '/account-deactivated',
        context: {
          isAdmin: false,
          isPro: false,
          email: email ?? undefined,
          userStatus: 'deactivated',
        },
      };
    }

    // Check for banned user
    if (dbUser?.status === 'banned') {
      return {
        state: UserState.BANNED,
        clerkUserId,
        dbUserId: dbUser.id,
        profileId: null,
        redirectTo: '/account-banned',
        context: {
          isAdmin: false,
          isPro: false,
          email: email ?? undefined,
          userStatus: 'banned',
        },
      };
    }

    // Step 3: Check waitlist status by email (if no DB user or checking access)
    let waitlistEntry: WaitlistRow | null = null;
    let waitlistInvite: WaitlistInviteRow | null = null;

    if (email) {
      const normalizedEmail = email.toLowerCase().trim();

      // Query waitlist entry
      const [entry] = await db
        .select({
          id: waitlistEntries.id,
          status: waitlistEntries.status,
        })
        .from(waitlistEntries)
        .where(eq(waitlistEntries.email, normalizedEmail))
        .limit(1);

      waitlistEntry = entry ?? null;

      // If invited, get the claim token
      if (waitlistEntry?.status === 'invited') {
        const [invite] = await db
          .select({
            claimToken: waitlistInvites.claimToken,
            status: waitlistInvites.status,
          })
          .from(waitlistInvites)
          .where(eq(waitlistInvites.waitlistEntryId, waitlistEntry.id))
          .limit(1);

        waitlistInvite = invite ?? null;
      }
    }

    // Step 4: If no DB user exists, determine if they can proceed
    if (!dbUser) {
      // Check if they have a valid waitlist entry
      if (!waitlistEntry) {
        // No waitlist entry - they need to submit
        return {
          state: UserState.NEEDS_WAITLIST_SUBMISSION,
          clerkUserId,
          dbUserId: null,
          profileId: null,
          redirectTo: '/waitlist',
          context: {
            isAdmin: false,
            isPro: false,
            email: email ?? undefined,
            displayName: displayName ?? undefined,
          },
        };
      }

      if (waitlistEntry.status === 'new') {
        return {
          state: UserState.WAITLIST_PENDING,
          clerkUserId,
          dbUserId: null,
          profileId: null,
          redirectTo: '/waitlist/pending',
          context: {
            isAdmin: false,
            isPro: false,
            email: email ?? undefined,
            waitlistStatus: 'new',
          },
        };
      }

      if (waitlistEntry.status === 'rejected') {
        return {
          state: UserState.WAITLIST_PENDING, // Using same state for rejected
          clerkUserId,
          dbUserId: null,
          profileId: null,
          redirectTo: '/waitlist/rejected',
          context: {
            isAdmin: false,
            isPro: false,
            email: email ?? undefined,
            waitlistStatus: 'rejected',
          },
        };
      }

      if (waitlistEntry.status === 'invited' && waitlistInvite?.claimToken) {
        return {
          state: UserState.WAITLIST_INVITED,
          clerkUserId,
          dbUserId: null,
          profileId: null,
          redirectTo: `/claim/${waitlistInvite.claimToken}`,
          context: {
            isAdmin: false,
            isPro: false,
            email: email ?? undefined,
            claimToken: waitlistInvite.claimToken,
            waitlistStatus: 'invited',
          },
        };
      }

      // Waitlist is claimed but no DB user - this is an edge case
      // User may need to go through onboarding to create their DB user
      if (waitlistEntry.status === 'claimed') {
        return {
          state: UserState.NEEDS_DB_USER,
          clerkUserId,
          dbUserId: null,
          profileId: null,
          redirectTo: '/onboarding',
          context: {
            isAdmin: false,
            isPro: false,
            email: email ?? undefined,
            waitlistStatus: 'claimed',
          },
        };
      }

      // Fallback - shouldn't happen
      return {
        state: UserState.NEEDS_WAITLIST_SUBMISSION,
        clerkUserId,
        dbUserId: null,
        profileId: null,
        redirectTo: '/waitlist',
        context: {
          isAdmin: false,
          isPro: false,
          email: email ?? undefined,
        },
      };
    }

    // Step 5: DB user exists - check for profile
    const [profile] = await db
      .select({
        id: creatorProfiles.id,
        isPrimary: creatorProfiles.isPrimary,
        isClaimed: creatorProfiles.isClaimed,
        username: creatorProfiles.username,
        displayName: creatorProfiles.displayName,
        onboardingCompletedAt: creatorProfiles.onboardingCompletedAt,
      })
      .from(creatorProfiles)
      .where(
        and(
          eq(creatorProfiles.userId, dbUser.id),
          eq(creatorProfiles.isPrimary, true)
        )
      )
      .limit(1);

    // If no primary profile, check for any profile
    let primaryProfile: ProfileRow | null = profile ?? null;

    if (!primaryProfile) {
      const [anyProfile] = await db
        .select({
          id: creatorProfiles.id,
          isPrimary: creatorProfiles.isPrimary,
          isClaimed: creatorProfiles.isClaimed,
          username: creatorProfiles.username,
          displayName: creatorProfiles.displayName,
          onboardingCompletedAt: creatorProfiles.onboardingCompletedAt,
        })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.userId, dbUser.id))
        .limit(1);

      primaryProfile = anyProfile ?? null;
    }

    // Check admin status
    const userIsAdmin = await isAdmin(clerkUserId);

    // No profile - check if they're invited
    if (!primaryProfile) {
      // Check if there's a pending invite for them
      if (waitlistEntry?.status === 'invited' && waitlistInvite?.claimToken) {
        return {
          state: UserState.WAITLIST_INVITED,
          clerkUserId,
          dbUserId: dbUser.id,
          profileId: null,
          redirectTo: `/claim/${waitlistInvite.claimToken}`,
          context: {
            isAdmin: userIsAdmin,
            isPro: dbUser.isPro ?? false,
            email: email ?? undefined,
            claimToken: waitlistInvite.claimToken,
            waitlistStatus: 'invited',
            userStatus: dbUser.status,
          },
        };
      }

      // No profile, no invite - they need to complete onboarding
      return {
        state: UserState.NEEDS_ONBOARDING,
        clerkUserId,
        dbUserId: dbUser.id,
        profileId: null,
        redirectTo: '/onboarding',
        context: {
          isAdmin: userIsAdmin,
          isPro: dbUser.isPro ?? false,
          email: email ?? undefined,
          displayName: displayName ?? undefined,
          userStatus: dbUser.status,
          waitlistStatus: waitlistEntry?.status,
        },
      };
    }

    // Step 6: Profile exists - check if onboarding is complete
    const isProfilePublishable =
      primaryProfile.onboardingCompletedAt !== null &&
      primaryProfile.username &&
      primaryProfile.displayName;

    if (!isProfilePublishable) {
      return {
        state: UserState.NEEDS_ONBOARDING,
        clerkUserId,
        dbUserId: dbUser.id,
        profileId: primaryProfile.id,
        redirectTo: `/onboarding?handle=${encodeURIComponent(primaryProfile.username)}`,
        context: {
          isAdmin: userIsAdmin,
          isPro: dbUser.isPro ?? false,
          email: email ?? undefined,
          displayName: primaryProfile.displayName ?? displayName ?? undefined,
          username: primaryProfile.username,
          userStatus: dbUser.status,
        },
      };
    }

    // Step 7: User is fully active
    return {
      state: UserState.ACTIVE,
      clerkUserId,
      dbUserId: dbUser.id,
      profileId: primaryProfile.id,
      redirectTo: null, // No redirect needed - user can proceed
      context: {
        isAdmin: userIsAdmin,
        isPro: dbUser.isPro ?? false,
        email: email ?? undefined,
        displayName: primaryProfile.displayName ?? undefined,
        username: primaryProfile.username,
        userStatus: dbUser.status,
        waitlistStatus: waitlistEntry?.status,
      },
    };
  }
);

/**
 * Helper to check if a user state allows access to the main app.
 */
export function canAccessApp(state: UserState): boolean {
  return state === UserState.ACTIVE;
}

/**
 * Helper to check if a user state requires a redirect.
 */
export function requiresRedirect(result: AuthGateResult): boolean {
  return result.redirectTo !== null && result.state !== UserState.ACTIVE;
}

/**
 * Get the appropriate redirect path for a protected route.
 *
 * @param result - The auth gate result
 * @param currentPath - The current URL path (for redirect_url param)
 * @returns The redirect path with appropriate query params
 */
export function getRedirectPath(
  result: AuthGateResult,
  currentPath?: string
): string {
  if (!result.redirectTo) {
    return '/app/dashboard/overview';
  }

  // Add redirect_url for auth pages
  if (
    currentPath &&
    (result.redirectTo === '/signin' || result.redirectTo === '/signup')
  ) {
    return `${result.redirectTo}?redirect_url=${encodeURIComponent(currentPath)}`;
  }

  return result.redirectTo;
}

/**
 * Ensures a user row exists in the database for the given Clerk user.
 *
 * This should be called when a user needs to be provisioned (NEEDS_DB_USER state).
 * It creates a minimal user row that can be enhanced during onboarding.
 *
 * @param clerkUserId - The Clerk user ID
 * @param email - The user's email (optional)
 * @returns The created or existing user ID
 */
export async function ensureDbUser(
  clerkUserId: string,
  email?: string | null
): Promise<string> {
  // Check if user already exists
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  if (existingUser) {
    return existingUser.id;
  }

  // Create new user
  const [newUser] = await db
    .insert(users)
    .values({
      clerkId: clerkUserId,
      email: email?.toLowerCase().trim() ?? null,
      status: 'active',
    })
    .returning({ id: users.id });

  return newUser.id;
}
