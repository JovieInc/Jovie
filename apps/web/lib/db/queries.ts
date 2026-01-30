/**
 * Database Queries
 *
 * @deprecated This file is maintained for backwards compatibility.
 * For profile operations, import from '@/lib/services/profile' instead.
 */

import { eq } from 'drizzle-orm';
import { db } from './index';
import { creatorProfiles, socialLinks, users } from './schema';

// Re-export profile service functions for backwards compatibility
export {
  getProfileByUsername as getCreatorProfileByUsername,
  getProfileWithLinks as getCreatorProfileWithLinks,
  incrementProfileViews,
  isClaimTokenValid,
} from '@/lib/services/profile';

/**
 * @deprecated Use `getDbUser` from '@/lib/auth/session' instead.
 */
export async function getUserByClerkId(clerkId: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  return user || null;
}

/**
 * @deprecated Use `isClaimTokenValid` from '@/lib/services/profile' instead.
 */
export async function isClaimTokenValidForProfile(params: {
  username: string;
  claimToken: string;
}): Promise<boolean> {
  const { isClaimTokenValid } = await import('@/lib/services/profile');
  return isClaimTokenValid(params.username, params.claimToken);
}

/**
 * @deprecated Use `updateProfileByClerkId` from '@/lib/services/profile' instead.
 */
export async function updateCreatorProfile(
  clerkUserId: string,
  updates: Partial<typeof creatorProfiles.$inferInsert>
) {
  const user = await getUserByClerkId(clerkUserId);
  if (!user) {
    throw new TypeError('User not found');
  }

  const [updated] = await db
    .update(creatorProfiles)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.userId, user.id))
    .returning();

  return updated || null;
}

/**
 * @deprecated Move to social links service when created.
 */
export async function createSocialLink(
  creatorProfileId: string,
  linkData: typeof socialLinks.$inferInsert
) {
  const [newLink] = await db
    .insert(socialLinks)
    .values({
      ...linkData,
      creatorProfileId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return newLink;
}

/**
 * @deprecated Move to social links service when created.
 */
export async function deleteSocialLink(linkId: string) {
  const [deleted] = await db
    .delete(socialLinks)
    .where(eq(socialLinks.id, linkId))
    .returning();
  return deleted || null;
}
