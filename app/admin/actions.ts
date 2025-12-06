'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { isAdminEmail } from '@/lib/admin/roles';
import { db } from '@/lib/db';
import { creatorProfiles, users } from '@/lib/db/schema';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

class AdminUnauthorizedError extends Error {
  constructor(message: string = 'Unauthorized') {
    super(message);
    this.name = 'AdminUnauthorizedError';
  }
}

function isAllowedAvatarHost(hostname: string): boolean {
  const allowedHosts = [
    'res.cloudinary.com',
    'images.clerk.dev',
    'img.clerk.com',
    'images.unsplash.com',
    'blob.vercel-storage.com',
  ];

  return allowedHosts.includes(hostname);
}

function validateAvatarUrl(url: string): string {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== 'https:') {
      throw new Error('Avatar URL must use https');
    }

    if (!isAllowedAvatarHost(parsed.hostname)) {
      throw new Error('Avatar URL host is not allowed');
    }

    return parsed.toString();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Invalid avatar URL provided';
    throw new Error(message);
  }
}

async function requireAdmin(): Promise<void> {
  const entitlements = await getCurrentUserEntitlements();

  if (!entitlements.isAuthenticated || !isAdminEmail(entitlements.email)) {
    console.warn('Admin access denied', {
      email: entitlements.email ?? null,
      reason: 'not_admin_or_not_authenticated',
    });
    throw new AdminUnauthorizedError();
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

  const [updatedProfile] = await db
    .update(creatorProfiles)
    .set({
      isVerified,
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.id, profileId))
    .returning({ usernameNormalized: creatorProfiles.usernameNormalized });

  if (updatedProfile?.usernameNormalized) {
    revalidatePath(`/${updatedProfile.usernameNormalized}`);
  }

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

  const sanitizedAvatarUrl = validateAvatarUrl(avatarUrl);

  const [updatedProfile] = await db
    .update(creatorProfiles)
    .set({
      avatarUrl: sanitizedAvatarUrl,
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.id, profileId))
    .returning({ usernameNormalized: creatorProfiles.usernameNormalized });

  if (updatedProfile?.usernameNormalized) {
    revalidatePath(`/${updatedProfile.usernameNormalized}`);
  }

  revalidatePath('/admin');
}

export async function toggleCreatorFeaturedAction(
  formData: FormData
): Promise<void> {
  await requireAdmin();

  const profileId = formData.get('profileId');
  const nextFeatured = formData.get('nextFeatured');

  if (typeof profileId !== 'string' || profileId.length === 0) {
    throw new Error('profileId is required');
  }

  const isFeatured =
    typeof nextFeatured === 'string' ? nextFeatured === 'true' : true;

  const [updatedProfile] = await db
    .update(creatorProfiles)
    .set({
      isFeatured,
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.id, profileId))
    .returning({ usernameNormalized: creatorProfiles.usernameNormalized });

  if (updatedProfile?.usernameNormalized) {
    revalidatePath(`/${updatedProfile.usernameNormalized}`);
  }

  revalidatePath('/admin');
  revalidatePath('/'); // Featured creators show on homepage
}

export async function toggleCreatorMarketingAction(
  formData: FormData
): Promise<void> {
  await requireAdmin();

  const profileId = formData.get('profileId');
  const nextMarketingOptOut = formData.get('nextMarketingOptOut');

  if (typeof profileId !== 'string' || profileId.length === 0) {
    throw new Error('profileId is required');
  }

  const marketingOptOut =
    typeof nextMarketingOptOut === 'string'
      ? nextMarketingOptOut === 'true'
      : false;

  await db
    .update(creatorProfiles)
    .set({
      marketingOptOut,
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.id, profileId));

  revalidatePath('/admin');
}

export async function deleteCreatorOrUserAction(
  formData: FormData
): Promise<void> {
  await requireAdmin();

  const profileId = formData.get('profileId');

  if (typeof profileId !== 'string' || profileId.length === 0) {
    throw new Error('profileId is required');
  }

  // Check if profile is claimed (has userId)
  const [profile] = await db
    .select({
      userId: creatorProfiles.userId,
      username: creatorProfiles.username,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId));

  if (!profile) {
    throw new Error('Profile not found');
  }

  if (profile.userId) {
    // Claimed creator: Soft delete user (set deletedAt timestamp)
    await db
      .update(users)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, profile.userId));
  } else {
    // Unclaimed creator: Hard delete profile (will cascade to social links, etc.)
    await db.delete(creatorProfiles).where(eq(creatorProfiles.id, profileId));
  }

  revalidatePath('/admin');
}
