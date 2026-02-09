'use server';

import { eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { APP_ROUTES } from '@/constants/routes';

import { isAdmin as checkAdminRole } from '@/lib/admin/roles';
import { getCachedAuth } from '@/lib/auth/cached';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { enqueueLinktreeIngestionJob } from '@/lib/ingestion/jobs';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { IngestionStatusManager } from '@/lib/ingestion/status-manager';
import { normalizeUrl } from '@/lib/utils/platform-detection';

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
      throw new SyntaxError('Avatar URL must use https');
    }

    if (!isAllowedAvatarHost(parsed.hostname)) {
      throw new SyntaxError('Avatar URL host is not allowed');
    }

    return parsed.toString();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Invalid avatar URL provided';
    throw new Error(message);
  }
}

async function requireAdmin(): Promise<void> {
  const { userId } = await getCachedAuth();

  if (!userId) {
    throw new AdminUnauthorizedError();
  }

  const adminStatus = await checkAdminRole(userId);

  if (!adminStatus) {
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
    throw new TypeError('profileId is required');
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

  await invalidateProfileCache(updatedProfile?.usernameNormalized);
  revalidatePath(APP_ROUTES.ADMIN);
  revalidatePath(APP_ROUTES.ADMIN_CREATORS);
}

export async function bulkRerunCreatorIngestionAction(
  formData: FormData
): Promise<{ queuedCount: number }> {
  await requireAdmin();

  const profileIdsRaw = formData.get('profileIds');
  if (typeof profileIdsRaw !== 'string' || profileIdsRaw.length === 0) {
    throw new TypeError('profileIds is required');
  }

  const parsed = JSON.parse(profileIdsRaw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new TypeError('profileIds must be an array');
  }

  const profileIds = parsed.filter((value): value is string => {
    return typeof value === 'string' && value.length > 0;
  });

  if (profileIds.length === 0) {
    throw new TypeError('profileIds must contain at least one id');
  }

  if (profileIds.length > 200) {
    throw new TypeError('Too many profileIds');
  }

  const queuedCount = await withSystemIngestionSession(async tx => {
    const profiles = await tx
      .select({
        id: creatorProfiles.id,
        username: creatorProfiles.username,
        usernameNormalized: creatorProfiles.usernameNormalized,
      })
      .from(creatorProfiles)
      .where(inArray(creatorProfiles.id, profileIds));

    if (profiles.length === 0) {
      return 0;
    }

    const jobIds = await Promise.all(
      profiles.map(async profile => {
        const handle = profile.usernameNormalized ?? profile.username;
        const sourceUrl = normalizeUrl(`https://linktr.ee/${handle}`);

        return enqueueLinktreeIngestionJob({
          creatorProfileId: profile.id,
          sourceUrl,
        });
      })
    );

    await IngestionStatusManager.markPendingBulk(
      tx,
      profiles.map(p => p.id)
    );

    return jobIds.filter(Boolean).length;
  });

  revalidatePath(APP_ROUTES.ADMIN);
  revalidatePath(APP_ROUTES.ADMIN_CREATORS);

  return { queuedCount };
}

export async function bulkSetCreatorsVerifiedAction(
  formData: FormData
): Promise<void> {
  await requireAdmin();

  const profileIdsRaw = formData.get('profileIds');
  const nextVerifiedRaw = formData.get('nextVerified');

  if (typeof profileIdsRaw !== 'string' || profileIdsRaw.length === 0) {
    throw new TypeError('profileIds is required');
  }

  const isVerified =
    typeof nextVerifiedRaw === 'string' ? nextVerifiedRaw === 'true' : true;

  const parsed = JSON.parse(profileIdsRaw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new TypeError('profileIds must be an array');
  }

  const profileIds = parsed.filter((value): value is string => {
    return typeof value === 'string' && value.length > 0;
  });

  if (profileIds.length === 0) {
    throw new TypeError('profileIds must contain at least one id');
  }

  if (profileIds.length > 200) {
    throw new TypeError('Too many profileIds');
  }

  const updatedProfiles = await db
    .update(creatorProfiles)
    .set({
      isVerified,
      updatedAt: new Date(),
    })
    .where(inArray(creatorProfiles.id, profileIds))
    .returning({ usernameNormalized: creatorProfiles.usernameNormalized });

  await Promise.all(
    updatedProfiles.map(profile =>
      invalidateProfileCache(profile.usernameNormalized)
    )
  );
  revalidatePath(APP_ROUTES.ADMIN);
  revalidatePath(APP_ROUTES.ADMIN_CREATORS);
}

export async function updateCreatorAvatarAsAdmin(
  profileId: string,
  avatarUrl: string
): Promise<void> {
  await requireAdmin();

  if (!profileId || !avatarUrl) {
    throw new TypeError('profileId and avatarUrl are required');
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

  await invalidateProfileCache(updatedProfile?.usernameNormalized);
  revalidatePath(APP_ROUTES.ADMIN);
  revalidatePath(APP_ROUTES.ADMIN_CREATORS);
}

export async function toggleCreatorFeaturedAction(
  formData: FormData
): Promise<void> {
  await requireAdmin();

  const profileId = formData.get('profileId');
  const nextFeatured = formData.get('nextFeatured');

  if (typeof profileId !== 'string' || profileId.length === 0) {
    throw new TypeError('profileId is required');
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

  await invalidateProfileCache(updatedProfile?.usernameNormalized);
  revalidatePath(APP_ROUTES.ADMIN);
  revalidatePath(APP_ROUTES.ADMIN_CREATORS);
  revalidatePath('/'); // Featured creators show on homepage
}

export async function bulkSetCreatorsFeaturedAction(
  formData: FormData
): Promise<void> {
  await requireAdmin();

  const profileIdsRaw = formData.get('profileIds');
  const nextFeaturedRaw = formData.get('nextFeatured');

  if (typeof profileIdsRaw !== 'string' || profileIdsRaw.length === 0) {
    throw new TypeError('profileIds is required');
  }

  const isFeatured =
    typeof nextFeaturedRaw === 'string' ? nextFeaturedRaw === 'true' : true;

  const parsed = JSON.parse(profileIdsRaw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new TypeError('profileIds must be an array');
  }

  const profileIds = parsed.filter((value): value is string => {
    return typeof value === 'string' && value.length > 0;
  });

  if (profileIds.length === 0) {
    throw new TypeError('profileIds must contain at least one id');
  }

  if (profileIds.length > 200) {
    throw new TypeError('Too many profileIds');
  }

  const updatedProfiles = await db
    .update(creatorProfiles)
    .set({
      isFeatured,
      updatedAt: new Date(),
    })
    .where(inArray(creatorProfiles.id, profileIds))
    .returning({ usernameNormalized: creatorProfiles.usernameNormalized });

  await Promise.all(
    updatedProfiles.map(profile =>
      invalidateProfileCache(profile.usernameNormalized)
    )
  );
  revalidatePath(APP_ROUTES.ADMIN);
  revalidatePath(APP_ROUTES.ADMIN_CREATORS);
  revalidatePath('/');
}

export async function toggleCreatorMarketingAction(
  formData: FormData
): Promise<void> {
  await requireAdmin();

  const profileId = formData.get('profileId');
  const nextMarketingOptOut = formData.get('nextMarketingOptOut');

  if (typeof profileId !== 'string' || profileId.length === 0) {
    throw new TypeError('profileId is required');
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

  revalidatePath(APP_ROUTES.ADMIN);
  revalidatePath(APP_ROUTES.ADMIN_CREATORS);
}

export async function deleteCreatorOrUserAction(
  formData: FormData
): Promise<void> {
  await requireAdmin();

  const profileId = formData.get('profileId');

  if (typeof profileId !== 'string' || profileId.length === 0) {
    throw new TypeError('profileId is required');
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
    throw new TypeError('Profile not found');
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

  revalidatePath(APP_ROUTES.ADMIN);
  revalidatePath(APP_ROUTES.ADMIN_CREATORS);
}
