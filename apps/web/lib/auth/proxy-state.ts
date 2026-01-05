'server only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { creatorProfiles, users } from '@/lib/db/schema';

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
 * @param clerkUserId - The Clerk user ID from auth()
 * @returns Boolean flags indicating what the user needs
 */
export async function getUserState(
  clerkUserId: string
): Promise<ProxyUserState> {
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
}
