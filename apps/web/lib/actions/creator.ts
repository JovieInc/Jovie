import 'server-only';

import { revalidatePath } from 'next/cache';
import { updateCreatorProfile as updateProfile } from '@/app/dashboard/actions';
import { getCreatorProfileWithLinks } from '@/lib/db/queries';
import type { CreatorProfile } from '@/lib/db/schema';
import { captureError } from '@/lib/error-tracking';

type CreatorProfileWithLinks = Awaited<
  ReturnType<typeof getCreatorProfileWithLinks>
>;

export async function fetchCreatorProfile(
  username: string
): Promise<CreatorProfileWithLinks> {
  try {
    return await getCreatorProfileWithLinks(username);
  } catch (error) {
    captureError('Error fetching creator profile', error, { username });
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
    captureError('Error updating creator profile', error, { userId });
    return { success: false, error: 'Failed to update profile' };
  }
}
