'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { isAdminEmail } from '@/lib/admin/roles';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

async function requireAdmin(): Promise<void> {
  const entitlements = await getCurrentUserEntitlements();

  if (!entitlements.isAuthenticated || !isAdminEmail(entitlements.email)) {
    throw new Error('Unauthorized');
  }
}

export async function toggleCreatorVerifiedAction(
  formData: FormData
): Promise<void> {
  await requireAdmin();

  const profileId = formData.get('profileId');
  const nextVerified = formData.get('nextVerified');

  if (typeof profileId !== 'string' || profileId.length === 0) {
    throw new Error('profileId is required');
  }

  const isVerified =
    typeof nextVerified === 'string' ? nextVerified === 'true' : true;

  await db
    .update(creatorProfiles)
    .set({
      isVerified,
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.id, profileId));

  revalidatePath('/admin');
}

export async function updateCreatorAvatarAsAdmin(
  profileId: string,
  avatarUrl: string
): Promise<void> {
  await requireAdmin();

  if (!profileId || !avatarUrl) {
    throw new Error('profileId and avatarUrl are required');
  }

  await db
    .update(creatorProfiles)
    .set({
      avatarUrl,
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.id, profileId));

  revalidatePath('/admin');
}
