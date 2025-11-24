'server only';

import { auth } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { updateCreatorProfile as updateProfile } from '@/app/dashboard/actions';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { getCreatorProfileWithLinks } from '@/lib/db/queries';
import {
  type CreatorProfile,
  creatorProfiles,
  type NewSocialLink,
  type SocialLink,
  socialLinks,
  users,
} from '@/lib/db/schema';

export async function fetchCreatorProfile(
  username: string
): Promise<(CreatorProfile & { socialLinks: SocialLink[] }) | null> {
  try {
    return await getCreatorProfileWithLinks(username);
  } catch (error) {
    console.error('Error fetching creator profile:', error);
    throw new Error('Failed to fetch creator profile');
  }
}

export async function updateCreatorProfileAction(
  userId: string,
  updates: {
    displayName?: string;
    bio?: string;
    isPublic?: boolean;
    marketingOptOut?: boolean;
  }
): Promise<{ success: boolean; data?: CreatorProfile; error?: string }> {
  try {
    const updated = await updateProfile(userId, updates);
    revalidatePath('/dashboard/profile');
    return { success: true, data: updated };
  } catch (error) {
    console.error('Error updating creator profile:', error);
    return { success: false, error: 'Failed to update profile' };
  }
}

export interface CreateSocialLinkInput {
  creatorProfileId: string;
  platform: string;
  platformType: string;
  url: string;
  displayText?: string | null;
  sortOrder?: number | null;
}

export interface CreateSocialLinkResult {
  success: boolean;
  data?: SocialLink;
  error?: string;
}

export async function createSocialLinkAction(
  input: CreateSocialLinkInput
): Promise<CreateSocialLinkResult> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    return await withDbSession(async clerkUserId => {
      // Ensure the requested profile belongs to the current user
      const [owner] = await db
        .select({
          userId: users.id,
          profileId: creatorProfiles.id,
        })
        .from(creatorProfiles)
        .innerJoin(users, eq(users.id, creatorProfiles.userId))
        .where(
          and(
            eq(creatorProfiles.id, input.creatorProfileId),
            eq(users.clerkId, clerkUserId)
          )
        )
        .limit(1);

      if (!owner?.profileId) {
        return { success: false, error: 'Profile not found or unauthorized' };
      }

      const values: NewSocialLink = {
        creatorProfileId: owner.profileId,
        platform: input.platform,
        platformType: input.platformType,
        url: input.url,
        displayText: input.displayText ?? null,
        sortOrder: input.sortOrder ?? 0,
        isActive: true,
        clicks: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const [created] = await db.insert(socialLinks).values(values).returning();

      // Revalidate dashboard links view for this profile
      revalidatePath('/dashboard/links');

      return { success: true, data: created };
    });
  } catch (error) {
    console.error('Error creating social link:', error);
    return { success: false, error: 'Failed to create social link' };
  }
}
