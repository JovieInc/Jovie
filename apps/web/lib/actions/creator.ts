'server only';

import { revalidatePath } from 'next/cache';
import { updateCreatorProfile as updateProfile } from '@/app/dashboard/actions';
import { getCreatorProfileWithLinks } from '@/lib/db/queries';
import type { CreatorProfile } from '@/lib/db/schema';
import { createScopedLogger } from '@/lib/utils/logger';

const log = createScopedLogger('CreatorActions');

type CreatorProfileWithLinks = Awaited<
  ReturnType<typeof getCreatorProfileWithLinks>
>;

export async function fetchCreatorProfile(
  username: string
): Promise<CreatorProfileWithLinks> {
  try {
    return await getCreatorProfileWithLinks(username);
  } catch (error) {
    log.error('Error fetching creator profile', { error });
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
    revalidatePath('/app/dashboard/profile');
    return { success: true, data: updated };
  } catch (error) {
    log.error('Error updating creator profile', { error });
    return { success: false, error: 'Failed to update profile' };
  }
}
