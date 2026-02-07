import 'server-only';

import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';

/**
 * Fetch the authenticated user's profile for self-exclusion checks.
 * Returns null if unauthenticated or profile not found.
 */
async function getAuthenticatedUserProfile(): Promise<{
  profileId: string;
  usernameNormalized: string;
  excludeSelf: boolean;
} | null> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;

  const [row] = await db
    .select({
      profileId: creatorProfiles.id,
      usernameNormalized: creatorProfiles.usernameNormalized,
      settings: creatorProfiles.settings,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  if (!row) return null;

  const settings = row.settings as Record<string, unknown> | null;
  return {
    profileId: row.profileId,
    usernameNormalized: row.usernameNormalized,
    excludeSelf: Boolean(settings?.exclude_self_from_analytics),
  };
}

/**
 * Check if the current authenticated user should be excluded from analytics
 * for a given profile (identified by handle/username).
 *
 * Returns true if:
 * 1. The visitor is authenticated
 * 2. They own the profile being visited
 * 3. They have `exclude_self_from_analytics` enabled in their settings
 *
 * Returns false (don't exclude) if any condition is not met, or on error.
 * Designed to be non-blocking — failures are swallowed so tracking always works.
 */
export async function shouldExcludeSelfByHandle(
  handle: string
): Promise<boolean> {
  try {
    const profile = await getAuthenticatedUserProfile();
    if (!profile?.excludeSelf) return false;
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
 * Same logic as shouldExcludeSelfByHandle but for click tracking which
 * uses profileId instead of handle.
 */
export async function shouldExcludeSelfByProfileId(
  profileId: string
): Promise<boolean> {
  try {
    const profile = await getAuthenticatedUserProfile();
    if (!profile?.excludeSelf) return false;
    return profile.profileId === profileId;
  } catch {
    // Never block tracking on auth/DB errors
    return false;
  }
}
