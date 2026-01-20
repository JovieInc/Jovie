import 'server-only';

import { and, eq, isNull, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { creatorProfiles, users } from '@/lib/db/schema';
import { captureError } from '@/lib/error-tracking';

export interface ProxyUserState {
  needsWaitlist: boolean;
  needsOnboarding: boolean;
  isActive: boolean;
}

/**
 * Lightweight user state check for proxy.ts
 *
 * This performs a single optimized query to determine user state for routing.
 * Used by proxy.ts to make ONE auth decision at the edge, eliminating redirect loops.
 *
 * IMPORTANT: Filters out soft-deleted and banned users for security.
 *
 * Uses userStatus lifecycle enum as single source of truth for auth state.
 *
 * @param clerkUserId - The Clerk user ID from auth()
 * @returns Boolean flags indicating what the user needs
 */
export async function getUserState(
  clerkUserId: string
): Promise<ProxyUserState> {
  try {
    // Single query with join - optimized for proxy performance
    // Filter out deleted and banned users to prevent misrouting
    const [result] = await db
      .select({
        dbUserId: users.id,
        userStatus: users.userStatus, // Single source of truth for user lifecycle state
        profileId: creatorProfiles.id,
        profileComplete: creatorProfiles.onboardingCompletedAt,
      })
      .from(users)
      .leftJoin(
        creatorProfiles,
        and(
          eq(creatorProfiles.userId, users.id),
          eq(creatorProfiles.isClaimed, true)
        )
      )
      .where(
        and(
          eq(users.clerkId, clerkUserId),
          isNull(users.deletedAt), // Exclude soft-deleted users
          ne(users.userStatus, 'banned') // Exclude banned users
        )
      )
      .limit(1);

    // No DB user → needs waitlist/signup
    if (!result?.dbUserId) {
      return { needsWaitlist: true, needsOnboarding: false, isActive: false };
    }

    // Check waitlist approval using userStatus lifecycle
    // userStatus progression: waitlist_pending → waitlist_approved → profile_claimed → onboarding_incomplete → active
    const isWaitlistApproved =
      result.userStatus === 'waitlist_approved' ||
      result.userStatus === 'profile_claimed' ||
      result.userStatus === 'onboarding_incomplete' ||
      result.userStatus === 'active';

    if (!isWaitlistApproved) {
      return { needsWaitlist: true, needsOnboarding: false, isActive: false };
    }

    // Has waitlist approval but no profile or incomplete profile → needs onboarding
    if (!result.profileId || !result.profileComplete) {
      return { needsWaitlist: false, needsOnboarding: true, isActive: false };
    }

    // Fully active user
    return { needsWaitlist: false, needsOnboarding: false, isActive: true };
  } catch (error) {
    // Log error with context for debugging
    await captureError('Database query failed in proxy state check', error, {
      clerkUserId,
      operation: 'getProxyUserState',
    });

    // Safe fallback: treat as needing waitlist to avoid exposing app to unauthorized access
    return { needsWaitlist: true, needsOnboarding: false, isActive: false };
  }
}
