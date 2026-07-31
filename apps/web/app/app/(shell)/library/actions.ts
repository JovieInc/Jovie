'use server';

import { revalidatePath } from 'next/cache';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import {
  restoreArchivedMerchCard,
  updateMerchCardStatus,
} from '@/lib/merch/service';

interface LibraryMerchLifecycleInput {
  readonly merchCardId: string;
  readonly profileId: string;
}

async function requireUserId(): Promise<string> {
  const { userId } = await getCachedAuth();
  if (!userId) throw new Error('Unauthorized');
  return userId;
}

export async function archiveLibraryMerchCard(
  input: LibraryMerchLifecycleInput
): Promise<{ success: true }> {
  const userId = await requireUserId();
  await updateMerchCardStatus({
    cardId: input.merchCardId,
    profileId: input.profileId,
    clerkUserId: userId,
    status: 'archived',
  });
  revalidatePath(APP_ROUTES.LIBRARY);
  return { success: true };
}

export async function restoreLibraryMerchCard(
  input: LibraryMerchLifecycleInput
): Promise<{ success: true }> {
  const userId = await requireUserId();
  await restoreArchivedMerchCard({
    cardId: input.merchCardId,
    profileId: input.profileId,
    clerkUserId: userId,
  });
  revalidatePath(APP_ROUTES.LIBRARY);
  return { success: true };
}
