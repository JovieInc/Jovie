'use server';

/**
 * Update profile fields during onboarding profile review.
 *
 * Lightweight server action for saving display name, bio, and avatar URL
 * from the profile review step.
 */

import { and, eq } from 'drizzle-orm';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';

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
    .select({ id: creatorProfiles.id })
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
  }

  if (Object.keys(profileUpdates).length > 0) {
    profileUpdates.updatedAt = new Date();
    await db
      .update(creatorProfiles)
      .set(profileUpdates)
      .where(eq(creatorProfiles.id, profile.id));
  }

  return { success: true };
}
