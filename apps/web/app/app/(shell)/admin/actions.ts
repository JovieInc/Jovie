'use server';

import { and, desc, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { APP_ROUTES } from '@/constants/routes';

import { isAdmin as checkAdminRole } from '@/lib/admin/roles';
import { getCachedAuth } from '@/lib/auth/cached';
import { syncAllClerkMetadata } from '@/lib/auth/clerk-sync';
import { invalidateProxyUserStateCache } from '@/lib/auth/proxy-state';
import { checkUserStatus } from '@/lib/auth/status-checker';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { db } from '@/lib/db';
import { runLegacyDbTransaction } from '@/lib/db/legacy-transaction';
import { adminAuditLog } from '@/lib/db/schema/admin';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { isAllowedAvatarHostname } from '@/lib/images/avatar-hosts';
import {
  enqueueMusicFetchEnrichmentJob,
  fireDspDiscovery,
} from '@/lib/ingestion/jobs';
import { buildThemeWithProfileAccent } from '@/lib/profile/profile-theme.server';
import { extractSpotifyArtistId } from '@/lib/spotify/artist-id';
import { logger } from '@/lib/utils/logger';
import { sendVerificationApprovedEmail } from '@/lib/verification/notifications';

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

  // Proxy skips ban checks for /app/* routes, so verify the acting
  // admin is not banned/suspended/deleted before allowing any action.
  const [adminUser] = await db
    .select({
      userStatus: users.userStatus,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.clerkId, userId))
    .limit(1);

  if (!adminUser) {
    throw new AdminUnauthorizedError();
  }

  const { isBlocked } = checkUserStatus(
    adminUser.userStatus,
    adminUser.deletedAt
  );
  if (isBlocked) {
    throw new AdminUnauthorizedError();
  }

  return userId;
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
    .returning({
      usernameNormalized: creatorProfiles.usernameNormalized,
      displayName: creatorProfiles.displayName,
      userId: creatorProfiles.userId,
    });

  if (isVerified && updatedProfile?.userId) {
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
  }

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

        // Enqueue DSP artist discovery alongside MusicFetch enrichment
        const spotifyArtistId =
          (profile.spotifyId?.trim() || null) ??
          (profile.spotifyUrl
            ? extractSpotifyArtistId(profile.spotifyUrl)
            : null);
        if (spotifyArtistId) {
          fireDspDiscovery({
            creatorProfileId: profile.id,
            spotifyArtistId,
            onError: error =>
              void captureError('DSP discovery enqueue failed', error, {
                creatorProfileId: profile.id,
              }),
          });
        } else if (profile.spotifyUrl) {
          logger.debug('DSP discovery skipped: non-artist Spotify URL', {
            creatorProfileId: profile.id,
            spotifyUrl: profile.spotifyUrl,
          });
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

  const profileIdsRaw = formData.get('profileIds');
  const nextVerifiedRaw = formData.get('nextVerified');

  if (typeof profileIdsRaw !== 'string' || profileIdsRaw.length === 0) {
    throw new TypeError('profileIds is required');
  }

  const isVerified =
    typeof nextVerifiedRaw === 'string' ? nextVerifiedRaw === 'true' : true;

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
  const [existingProfile] = await db
    .select({ theme: creatorProfiles.theme })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);

  const [updatedProfile] = await db
    .update(creatorProfiles)
    .set({
      avatarUrl: sanitizedAvatarUrl,
      theme: await buildThemeWithProfileAccent({
        existingTheme: existingProfile?.theme,
        sourceUrl: sanitizedAvatarUrl,
      }),
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
  const adminUserId = await requireAdmin();

  const profileId = formData.get('profileId');

  if (typeof profileId !== 'string' || profileId.length === 0) {
    throw new TypeError('profileId is required');
  }

  // Check if profile exists
  const [profile] = await db
    .select({
      username: creatorProfiles.username,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId));

  if (!profile) {
    throw new TypeError('Profile not found');
  }

  // Prevent admin from deleting a profile linked to their own account
  const [claim] = await db
    .select({ userId: userProfileClaims.userId })
    .from(userProfileClaims)
    .where(eq(userProfileClaims.creatorProfileId, profileId))
    .limit(1);

  if (claim?.userId === adminUserId) {
    throw new TypeError('Cannot delete your own profile');
  }

  // Delete the creator profile (cascades to social links, claims, etc.)
  // This does NOT delete or soft-delete the associated user account.
  await db.delete(creatorProfiles).where(eq(creatorProfiles.id, profileId));

  revalidatePath(APP_ROUTES.ADMIN);
  revalidatePath(APP_ROUTES.ADMIN_CREATORS);
}

export async function banUserAction(formData: FormData): Promise<void> {
  const adminClerkId = await requireAdmin();

  const userId = formData.get('userId');
  const reason = formData.get('reason');

  if (typeof userId !== 'string' || userId.length === 0) {
    throw new TypeError('userId is required');
  }

  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new TypeError('reason is required');
  }

  // Resolve admin Clerk ID to DB UUID for audit log FK
  const [adminUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, adminClerkId))
    .limit(1);

  if (!adminUser) {
    throw new TypeError('Admin user not found in database');
  }

  // Self-ban guard (compare DB UUIDs)
  if (userId === adminUser.id) {
    throw new TypeError('Cannot ban your own account');
  }

  // Atomic: update status + write audit log (store previous status for restore)
  // ACID requirement: status update + audit log must be atomic to prevent
  // inconsistent state (e.g. user banned but no audit trail).
  const result = await runLegacyDbTransaction(async tx => {
    // Read current status before updating
    const [current] = await tx
      .select({ userStatus: users.userStatus, clerkId: users.clerkId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!current) {
      throw new TypeError('User not found');
    }

    if (current.userStatus === 'banned' || current.userStatus === 'suspended') {
      throw new TypeError('User is already suspended');
    }

    await tx
      .update(users)
      .set({ userStatus: 'banned' })
      .where(eq(users.id, userId));

    await tx.insert(adminAuditLog).values({
      adminUserId: adminUser.id,
      targetUserId: userId,
      action: 'ban_user',
      metadata: {
        reason: reason.trim(),
        previousStatus: current.userStatus,
      },
    });

    return { clerkId: current.clerkId };
  });

  // Post-commit side effects (best-effort)
  try {
    await syncAllClerkMetadata(result.clerkId);
  } catch (error) {
    captureError('Failed to sync Clerk metadata after ban', error, {
      userId,
      clerkId: result.clerkId,
    });
  }

  try {
    await invalidateProxyUserStateCache(result.clerkId);
  } catch (error) {
    captureError('Failed to invalidate proxy cache after ban', error, {
      userId,
      clerkId: result.clerkId,
    });
  }

  revalidatePath(APP_ROUTES.ADMIN);
}

export async function unbanUserAction(formData: FormData): Promise<void> {
  const adminClerkId = await requireAdmin();

  const userId = formData.get('userId');

  if (typeof userId !== 'string' || userId.length === 0) {
    throw new TypeError('userId is required');
  }

  // Resolve admin Clerk ID to DB UUID for audit log FK
  const [adminUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, adminClerkId))
    .limit(1);

  if (!adminUser) {
    throw new TypeError('Admin user not found in database');
  }

  // Self-unban guard (compare DB UUIDs)
  if (userId === adminUser.id) {
    throw new TypeError('Cannot restore your own account');
  }

  // Atomic: restore to previous status + write audit log
  // Look up the most recent ban_user audit entry to find what the user's
  // status was before banning. Default to 'active' if no record found.
  // ACID requirement: status update + audit log must be atomic to prevent
  // inconsistent state (e.g. status restored but no audit trail).
  const result = await runLegacyDbTransaction(async tx => {
    const [user] = await tx
      .select({
        clerkId: users.clerkId,
        deletedAt: users.deletedAt,
        userStatus: users.userStatus,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new TypeError('User not found');
    }

    // Reject restore for soft-deleted users — deletedAt takes precedence
    if (user.deletedAt) {
      throw new TypeError('Cannot restore a deleted account');
    }

    // Only allow restore for users who are actually blocked
    if (user.userStatus !== 'banned' && user.userStatus !== 'suspended') {
      throw new TypeError('User is not currently suspended');
    }

    // Find the previous status from the most recent ban audit entry
    const [banEntry] = await tx
      .select({ metadata: adminAuditLog.metadata })
      .from(adminAuditLog)
      .where(
        and(
          eq(adminAuditLog.targetUserId, userId),
          eq(adminAuditLog.action, 'ban_user')
        )
      )
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(1);

    const previousStatus = (
      banEntry?.metadata as Record<string, unknown> | null
    )?.previousStatus as string | undefined;

    const VALID_RESTORE_STATUSES = new Set([
      'active',
      'waitlist_pending',
      'waitlist_approved',
      'profile_claimed',
      'onboarding_incomplete',
    ] as const);

    type RestoreStatus =
      | 'active'
      | 'waitlist_pending'
      | 'waitlist_approved'
      | 'profile_claimed'
      | 'onboarding_incomplete';

    const restoreStatus: RestoreStatus =
      previousStatus &&
      VALID_RESTORE_STATUSES.has(previousStatus as RestoreStatus)
        ? (previousStatus as RestoreStatus)
        : 'active';

    await tx
      .update(users)
      .set({ userStatus: restoreStatus })
      .where(eq(users.id, userId));

    await tx.insert(adminAuditLog).values({
      adminUserId: adminUser.id,
      targetUserId: userId,
      action: 'unban_user',
      metadata: { restoredTo: restoreStatus },
    });

    return { clerkId: user.clerkId };
  });

  // Post-commit side effects (best-effort)
  try {
    await syncAllClerkMetadata(result.clerkId);
  } catch (error) {
    captureError('Failed to sync Clerk metadata after unban', error, {
      userId,
      clerkId: result.clerkId,
    });
  }

  try {
    await invalidateProxyUserStateCache(result.clerkId);
  } catch (error) {
    captureError('Failed to invalidate proxy cache after unban', error, {
      userId,
      clerkId: result.clerkId,
    });
  }

  revalidatePath(APP_ROUTES.ADMIN);
}
