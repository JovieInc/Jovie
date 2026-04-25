'use server';

/**
 * Update profile fields during onboarding profile review.
 *
 * Lightweight server action for saving display name, bio, and avatar URL
 * from the profile review step.
 */

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { buildThemeWithProfileAccent } from '@/lib/profile/profile-theme.server';

/**
 * Verify that the user's profile has an avatar URL set.
 * Used as defense-in-depth before allowing dashboard navigation from onboarding.
 */
export async function verifyProfileHasAvatar(): Promise<{
  avatarUrl: string;
}> {
  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const [profile] = await db
    .select({ avatarUrl: creatorProfiles.avatarUrl })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(and(eq(users.clerkId, userId), eq(creatorProfiles.isClaimed, true)))
    .limit(1);

  const avatarUrl = profile?.avatarUrl?.trim();
  if (!avatarUrl) {
    throw new Error('Profile photo is required');
  }

  return { avatarUrl };
}

/**
 * Get the current avatar URL for the authenticated user's profile.
 * Used for polling during onboarding to detect background avatar uploads.
 * Returns null if no avatar is set (instead of throwing like verifyProfileHasAvatar).
 */
export async function getProfileAvatarUrl(): Promise<{
  avatarUrl: string | null;
}> {
  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const [profile] = await db
    .select({ avatarUrl: creatorProfiles.avatarUrl })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(and(eq(users.clerkId, userId), eq(creatorProfiles.isClaimed, true)))
    .limit(1);

  return { avatarUrl: profile?.avatarUrl?.trim() || null };
}

export async function updateOnboardingProfile(updates: {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
}): Promise<{ success: boolean }> {
  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      avatarUrl: creatorProfiles.avatarUrl,
      theme: creatorProfiles.theme,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(and(eq(users.clerkId, userId), eq(creatorProfiles.isClaimed, true)))
    .limit(1);

  if (!profile) {
    throw new Error('Profile not found');
  }

  const profileUpdates: Partial<typeof creatorProfiles.$inferInsert> = {};

  if (updates.displayName !== undefined) {
    profileUpdates.displayName = updates.displayName.trim();
  }
  if (updates.bio !== undefined) {
    profileUpdates.bio = updates.bio.trim();
  }
  if (updates.avatarUrl !== undefined) {
    profileUpdates.avatarUrl = updates.avatarUrl;
    profileUpdates.theme = await buildThemeWithProfileAccent({
      existingTheme: profile.theme,
      sourceUrl: updates.avatarUrl,
    });
  }

  if (Object.keys(profileUpdates).length > 0) {
    profileUpdates.updatedAt = new Date();
    await db
      .update(creatorProfiles)
      .set(profileUpdates)
      .where(eq(creatorProfiles.id, profile.id));

    // Invalidate dashboard cache so ProfileCompletionRedirect sees fresh data
    if (profileUpdates.avatarUrl) {
      revalidatePath(APP_ROUTES.DASHBOARD, 'layout');
    }
  }

  return { success: true };
}
