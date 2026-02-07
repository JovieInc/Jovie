import 'server-only';

import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';

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
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) return false;

    const [row] = await db
      .select({
        usernameNormalized: creatorProfiles.usernameNormalized,
        settings: creatorProfiles.settings,
      })
      .from(creatorProfiles)
      .innerJoin(users, eq(users.id, creatorProfiles.userId))
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);

    if (!row) return false;
    if (row.usernameNormalized !== handle.toLowerCase()) return false;

    const settings = row.settings as Record<string, unknown>;
    return Boolean(settings?.exclude_self_from_analytics);
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
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) return false;

    const [row] = await db
      .select({
        profileId: creatorProfiles.id,
        settings: creatorProfiles.settings,
      })
      .from(creatorProfiles)
      .innerJoin(users, eq(users.id, creatorProfiles.userId))
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);

    if (!row) return false;
    if (row.profileId !== profileId) return false;

    const settings = row.settings as Record<string, unknown>;
    return Boolean(settings?.exclude_self_from_analytics);
  } catch {
    // Never block tracking on auth/DB errors
    return false;
  }
}
