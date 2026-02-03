import 'server-only';

import { revalidatePath } from 'next/cache';
import { updateCreatorProfile as updateProfile } from '@/app/app/(shell)/dashboard/actions';
import { APP_ROUTES } from '@/constants/routes';
import type { CreatorProfile } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { getProfileWithLinks as getCreatorProfileWithLinks } from '@/lib/services/profile';

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
    revalidatePath(APP_ROUTES.PROFILE);
    return { success: true, data: updated };
  } catch (error) {
    captureError('Error updating creator profile', error, { userId });
    return { success: false, error: 'Failed to update profile' };
  }
}
