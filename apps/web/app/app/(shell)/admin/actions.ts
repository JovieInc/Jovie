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
import { captureWarning } from '@/lib/error-tracking';
import { isAllowedAvatarHostname } from '@/lib/images/avatar-hosts';
import { enqueueMusicFetchEnrichmentJob } from '@/lib/ingestion/jobs';
import { sendVerificationApprovedEmail } from '@/lib/verification/notifications';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertValidUuid(value: string, fieldName: string): void {
  if (!UUID_RE.test(value)) {
    throw new TypeError(`${fieldName} must be a valid UUID`);
  }
}

function safeParseJsonArray(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new TypeError('profileIds must be valid JSON');
  }
}

class AdminUnauthorizedError extends Error {
  constructor(message: string = 'Unauthorized') {
    super(message);
    this.name = 'AdminUnauthorizedError';
  }
}

function isAllowedAvatarHost(hostname: string): boolean {
  return isAllowedAvatarHostname(hostname);
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

async function requireAdmin(): Promise<string> {
  const { userId } = await getCachedAuth();

  if (!userId) {
    throw new AdminUnauthorizedError();
  }

  const adminStatus = await checkAdminRole(userId);

  if (!adminStatus) {
    throw new AdminUnauthorizedError();
  }

  return userId;
}

function extractProfileId(formData: FormData): string {
  const profileId = formData.get('profileId');

  if (typeof profileId !== 'string' || profileId.trim().length === 0) {
    throw new TypeError('profileId is required');
  }

  assertValidUuid(profileId, 'profileId');
  return profileId;
}

function extractBulkProfileIds(formData: FormData): string[] {
  const profileIdsRaw = formData.get('profileIds');
  if (typeof profileIdsRaw !== 'string' || profileIdsRaw.length === 0) {
    throw new TypeError('profileIds is required');
  }

  const parsed = safeParseJsonArray(profileIdsRaw);
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

  const invalidId = profileIds.find(id => !UUID_RE.test(id));
  if (invalidId) {
    throw new TypeError('profileIds must contain valid UUIDs');
  }

  return profileIds;
}

export async function toggleCreatorVerifiedAction(
  formData: FormData
): Promise<void> {
  await requireAdmin();

  const profileId = extractProfileId(formData);
  const nextVerified = formData.get('nextVerified');

  const isVerified =
    typeof nextVerified === 'string' ? nextVerified === 'true' : true;

  const [updatedProfile] = await db
    .update(creatorProfiles)
    .set({
      isVerified,
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.id, profileId))
    .returning({
      usernameNormalized: creatorProfiles.usernameNormalized,
      displayName: creatorProfiles.displayName,
      userId: creatorProfiles.userId,
    });

  if (isVerified && updatedProfile?.userId) {
    try {
      const [creatorUser] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, updatedProfile.userId))
        .limit(1);

      if (creatorUser?.email) {
        const firstName =
          updatedProfile.displayName?.trim().split(' ')[0] ?? 'Hey there';
        await sendVerificationApprovedEmail({
          to: creatorUser.email,
          firstName,
        });
      }
    } catch (error) {
      captureWarning(
        '[admin/actions] Verification email failed — DB update succeeded',
        {
          profileId,
          userId: updatedProfile.userId,
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  await invalidateProfileCache(updatedProfile?.usernameNormalized);
  revalidatePath(APP_ROUTES.ADMIN);
  revalidatePath(APP_ROUTES.ADMIN_CREATORS);
}

export async function bulkRerunCreatorIngestionAction(
  formData: FormData
): Promise<{ queuedCount: number }> {
  await requireAdmin();

  const profileIds = extractBulkProfileIds(formData);

  const profiles = await db
    .select({
      id: creatorProfiles.id,
      spotifyId: creatorProfiles.spotifyId,
      spotifyUrl: creatorProfiles.spotifyUrl,
    })
    .from(creatorProfiles)
    .where(inArray(creatorProfiles.id, profileIds));

  const BATCH_SIZE = 25;
  let queuedCount = 0;

  for (let index = 0; index < profiles.length; index += BATCH_SIZE) {
    const batch = profiles.slice(index, index + BATCH_SIZE);
    const jobIds = await Promise.all(
      batch.map(async profile => {
        let spotifyUrl: string | null = null;
        if (profile.spotifyUrl?.trim()) {
          spotifyUrl = profile.spotifyUrl;
        } else if (profile.spotifyId) {
          spotifyUrl = `https://open.spotify.com/artist/${encodeURIComponent(profile.spotifyId)}`;
        }

        if (!spotifyUrl) {
          return null;
        }

        return enqueueMusicFetchEnrichmentJob({
          creatorProfileId: profile.id,
          spotifyUrl,
        });
      })
    );

    queuedCount += jobIds.filter(Boolean).length;
  }

  revalidatePath(APP_ROUTES.ADMIN);
  revalidatePath(APP_ROUTES.ADMIN_CREATORS);

  return { queuedCount };
}

export async function bulkSetCreatorsVerifiedAction(
  formData: FormData
): Promise<void> {
  await requireAdmin();

  const nextVerifiedRaw = formData.get('nextVerified');

  const isVerified =
    typeof nextVerifiedRaw === 'string' ? nextVerifiedRaw === 'true' : true;

  const profileIds = extractBulkProfileIds(formData);

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

  assertValidUuid(profileId, 'profileId');

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

  const profileId = extractProfileId(formData);
  const nextFeatured = formData.get('nextFeatured');

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

  const nextFeaturedRaw = formData.get('nextFeatured');

  const isFeatured =
    typeof nextFeaturedRaw === 'string' ? nextFeaturedRaw === 'true' : true;

  const profileIds = extractBulkProfileIds(formData);

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

  const profileId = extractProfileId(formData);
  const nextMarketingOptOut = formData.get('nextMarketingOptOut');

  const marketingOptOut =
    typeof nextMarketingOptOut === 'string'
      ? nextMarketingOptOut === 'true'
      : false;

  const [updatedProfile] = await db
    .update(creatorProfiles)
    .set({
      marketingOptOut,
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.id, profileId))
    .returning({
      usernameNormalized: creatorProfiles.usernameNormalized,
    });

  await invalidateProfileCache(updatedProfile?.usernameNormalized);
  revalidatePath(APP_ROUTES.ADMIN);
  revalidatePath(APP_ROUTES.ADMIN_CREATORS);
}

export async function deleteCreatorOrUserAction(
  formData: FormData
): Promise<void> {
  const adminUserId = await requireAdmin();

  const profileId = extractProfileId(formData);

  // Check if profile is claimed (has userId)
  const [profile] = await db
    .select({
      userId: creatorProfiles.userId,
      username: creatorProfiles.username,
      usernameNormalized: creatorProfiles.usernameNormalized,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId));

  if (!profile) {
    throw new TypeError('Profile not found');
  }

  // Prevent admin from deleting their own account
  if (profile.userId && profile.userId === adminUserId) {
    throw new TypeError('Cannot delete your own account');
  }

  if (profile.userId) {
    // Check if user is already soft-deleted
    const [existingUser] = await db
      .select({ deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, profile.userId));

    if (existingUser?.deletedAt) {
      throw new TypeError('User is already deleted');
    }

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

  await invalidateProfileCache(profile.usernameNormalized);
  revalidatePath(APP_ROUTES.ADMIN);
  revalidatePath(APP_ROUTES.ADMIN_CREATORS);
}
