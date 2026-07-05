import 'server-only';

import { eq } from 'drizzle-orm';
import { getOptionalAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';

/**
 * Fetch the authenticated user's active creator profile for self-exclusion checks.
 * Returns null if unauthenticated or profile not found.
 */
async function getAuthenticatedUserProfile(): Promise<{
  profileId: string;
  usernameNormalized: string;
} | null> {
  const { userId: clerkUserId } = await getOptionalAuth();
  if (!clerkUserId) return null;

  const [row] = await db
    .select({
      profileId: creatorProfiles.id,
      usernameNormalized: creatorProfiles.usernameNormalized,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.activeProfileId, creatorProfiles.id))
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  if (!row) return null;

  return {
    profileId: row.profileId,
    usernameNormalized: row.usernameNormalized,
  };
}

/**
 * Check if the current authenticated user should be excluded from analytics
 * for a given profile (identified by handle/username).
 *
 * Returns true when the visitor is authenticated and owns the profile.
 * Anonymous traffic is never excluded.
 *
 * Designed to be non-blocking — failures are swallowed so tracking always works.
 */
export async function shouldExcludeSelfByHandle(
  handle: string
): Promise<boolean> {
  try {
    const profile = await getAuthenticatedUserProfile();
    if (!profile) return false;
    return profile.usernameNormalized === handle.toLowerCase();
  } catch {
    // Never block tracking on auth/DB errors
    return false;
  }
}

/**
 * Check if the current authenticated user should be excluded from analytics
 * for a given profile (identified by creator profile ID).
 *
 * Same logic as shouldExcludeSelfByHandle but for audience visit/click tracking.
 */
export async function shouldExcludeSelfByProfileId(
  profileId: string
): Promise<boolean> {
  try {
    const profile = await getAuthenticatedUserProfile();
    if (!profile) return false;
    return profile.profileId === profileId;
  } catch {
    // Never block tracking on auth/DB errors
    return false;
  }
}
