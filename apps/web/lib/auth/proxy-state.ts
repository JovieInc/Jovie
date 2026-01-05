'server only';

import { and, eq } from 'drizzle-orm';
import { cache } from 'react';
import { db } from '@/lib/db';
import { creatorProfiles, users } from '@/lib/db/schema';

export interface ProxyUserState {
  needsWaitlist: boolean;
  needsOnboarding: boolean;
  isActive: boolean;
}

/**
 * Lightweight user state check for proxy.ts (uncached)
 *
 * This performs a single optimized query to determine user state for routing.
 * Used by proxy.ts to make ONE auth decision at the edge, eliminating redirect loops.
 *
 * @param clerkUserId - The Clerk user ID from auth()
 * @returns Boolean flags indicating what the user needs
 */
async function getUserStateUncached(
  clerkUserId: string
): Promise<ProxyUserState> {
  try {
    // Single query with join - optimized for proxy performance
    const [result] = await db
      .select({
        dbUserId: users.id,
        waitlistEntryId: users.waitlistEntryId,
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
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);

    // No DB user → needs waitlist/signup
    if (!result || !result.dbUserId) {
      return { needsWaitlist: true, needsOnboarding: false, isActive: false };
    }

    // Has DB user but no waitlist entry → needs waitlist
    if (!result.waitlistEntryId) {
      return { needsWaitlist: true, needsOnboarding: false, isActive: false };
    }

    // Has waitlist but no profile or incomplete profile → needs onboarding
    if (!result.profileId || !result.profileComplete) {
      return { needsWaitlist: false, needsOnboarding: true, isActive: false };
    }

    // Fully active user
    return { needsWaitlist: false, needsOnboarding: false, isActive: true };
  } catch (error) {
    // Log error with context for debugging
    console.error('[proxy-state] Database query failed:', {
      error,
      clerkUserId,
      message: error instanceof Error ? error.message : 'Unknown error',
    });

    // Safe fallback: treat as needing waitlist to avoid exposing app to unauthorized access
    return { needsWaitlist: true, needsOnboarding: false, isActive: false };
  }
}

/**
 * Request-scoped cached version of getUserState
 *
 * Uses React's cache() to deduplicate calls within the same request.
 * This prevents multiple DB queries when proxy.ts needs to check state multiple times.
 */
export const getUserState = cache(getUserStateUncached);
