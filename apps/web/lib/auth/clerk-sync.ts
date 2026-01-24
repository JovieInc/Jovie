'use server';

import { clerkClient } from '@clerk/nextjs/server';
import * as Sentry from '@sentry/nextjs';
import { eq } from 'drizzle-orm';

import { invalidateProxyUserStateCache } from '@/lib/auth/proxy-state';
import { db } from '@/lib/db';
import { adminAuditLog, creatorProfiles, users } from '@/lib/db/schema';
import { captureError, captureWarning } from '@/lib/error-tracking';

/**
 * Clerk metadata fields that Jovie mirrors from the database.
 *
 * These are read-only cached values in Clerk's publicMetadata.
 * The source of truth is always the Neon database.
 *
 * NOTE: App must never trust Clerk metadata for authorization.
 * Authorization is always enforced server-side from the database.
 */
export interface JovieClerkMetadata {
  /** User role: 'user' | 'admin' */
  jovie_role: 'user' | 'admin';
  /** User status: 'active' | 'pending' | 'banned' */
  jovie_status: 'active' | 'pending' | 'banned';
  /** Whether user has a complete creator profile */
  jovie_has_profile: boolean;
}

/**
 * Syncs Jovie-specific metadata to Clerk's publicMetadata.
 *
 * This function is called when:
 * - User completes onboarding (profile created)
 * - Admin role is granted/revoked
 * - User status changes (banned, etc.)
 *
 * IMPORTANT: This is a best-effort sync. Authorization decisions
 * must always be made from the database, not Clerk metadata.
 *
 * @param clerkUserId - The Clerk user ID to sync
 * @param data - The metadata to sync (partial, only changed fields)
 */
export async function syncClerkMetadata(
  clerkUserId: string,
  data: Partial<JovieClerkMetadata>
): Promise<{ success: boolean; error?: string }> {
  if (!clerkUserId) {
    return { success: false, error: 'Missing clerkUserId' };
  }

  try {
    const client = await clerkClient();

    // Get current metadata to merge with new data
    const user = await client.users.getUser(clerkUserId);
    const currentMetadata = (user.publicMetadata ||
      {}) as Partial<JovieClerkMetadata>;

    // Merge new data with existing metadata
    const updatedMetadata: Partial<JovieClerkMetadata> = {
      ...currentMetadata,
      ...data,
    };

    await client.users.updateUserMetadata(clerkUserId, {
      publicMetadata: updatedMetadata,
    });

    Sentry.addBreadcrumb({
      category: 'clerk-sync',
      message: 'Synced metadata for user',
      level: 'info',
      data: { clerkUserId, metadata: data },
    });
    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    await captureError('Failed to sync Clerk metadata', error, {
      component: 'clerk-sync',
      clerkUserId,
      data,
    });

    return { success: false, error: errorMessage };
  }
}

/**
 * Syncs all Jovie metadata for a user based on their current database state.
 *
 * This performs a full refresh of all mirrored fields. Use this when:
 * - User completes onboarding
 * - Manual re-sync is needed
 * - Debugging metadata drift
 *
 * @param clerkUserId - The Clerk user ID to sync
 */
export async function syncAllClerkMetadata(clerkUserId: string): Promise<{
  success: boolean;
  error?: string;
  metadata?: JovieClerkMetadata;
}> {
  if (!clerkUserId) {
    return { success: false, error: 'Missing clerkUserId' };
  }

  try {
    // Query user and profile in a single JOIN query for better performance
    const [result] = await db
      .select({
        // User fields
        userId: users.id,
        userStatus: users.userStatus,
        isAdmin: users.isAdmin,
        // Profile fields (nullable due to LEFT JOIN)
        profileId: creatorProfiles.id,
        onboardingCompletedAt: creatorProfiles.onboardingCompletedAt,
        username: creatorProfiles.username,
        displayName: creatorProfiles.displayName,
        isPublic: creatorProfiles.isPublic,
      })
      .from(users)
      .leftJoin(creatorProfiles, eq(creatorProfiles.userId, users.id))
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);

    if (!result) {
      // User doesn't exist in DB yet - sync minimal state
      const metadata: JovieClerkMetadata = {
        jovie_role: 'user',
        jovie_status: 'pending',
        jovie_has_profile: false,
      };

      const syncResult = await syncClerkMetadata(clerkUserId, metadata);
      return { ...syncResult, metadata };
    }

    // Determine if profile is complete
    const hasCompleteProfile = Boolean(
      result.profileId &&
        result.onboardingCompletedAt &&
        result.username &&
        result.displayName &&
        result.isPublic !== false
    );

    // Map userStatus lifecycle enum to Clerk's simpler status
    let clerkStatus: 'active' | 'pending' | 'banned';
    if (result.userStatus === 'banned' || result.userStatus === 'suspended') {
      clerkStatus = 'banned';
    } else if (result.userStatus === 'waitlist_pending') {
      clerkStatus = 'pending';
    } else {
      clerkStatus = 'active';
    }

    const metadata: JovieClerkMetadata = {
      jovie_role: result.isAdmin ? 'admin' : 'user',
      jovie_status: clerkStatus,
      jovie_has_profile: hasCompleteProfile,
    };

    const syncResult = await syncClerkMetadata(clerkUserId, metadata);
    return { ...syncResult, metadata };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    await captureError('Failed to perform full Clerk metadata sync', error, {
      component: 'clerk-sync',
      operation: 'full-sync',
      clerkUserId,
    });

    return { success: false, error: errorMessage };
  }
}

/**
 * Handles user deletion event from Clerk webhook.
 *
 * When a user is deleted in Clerk, we soft-delete the corresponding
 * database user to maintain referential integrity.
 *
 * @param clerkUserId - The Clerk user ID that was deleted
 * @param adminUserId - Optional admin user ID if this was an admin action
 */
export async function handleClerkUserDeleted(
  clerkUserId: string,
  adminUserId?: string
): Promise<{ success: boolean; error?: string }> {
  if (!clerkUserId) {
    return { success: false, error: 'Missing clerkUserId' };
  }

  try {
    // Find the DB user
    const [dbUser] = await db
      .select({ id: users.id, deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);

    if (!dbUser) {
      captureWarning('User not found in DB for Clerk deletion', {
        clerkUserId,
      });
      return { success: true }; // Already doesn't exist
    }

    if (dbUser.deletedAt) {
      Sentry.addBreadcrumb({
        category: 'clerk-sync',
        message: 'User already soft-deleted',
        level: 'info',
        data: { clerkUserId },
      });
      return { success: true }; // Already deleted
    }

    // Soft-delete the user
    const now = new Date();
    await db
      .update(users)
      .set({
        deletedAt: now,
        userStatus: 'banned',
        updatedAt: now,
      })
      .where(eq(users.id, dbUser.id));

    // Invalidate user state cache so middleware reflects deletion immediately
    await invalidateProxyUserStateCache(clerkUserId);

    // Log the action if we have an admin context
    if (adminUserId) {
      const [adminUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.clerkId, adminUserId))
        .limit(1);

      if (adminUser) {
        await db.insert(adminAuditLog).values({
          adminUserId: adminUser.id,
          targetUserId: dbUser.id,
          action: 'user_deleted_from_clerk',
          metadata: {
            clerkUserId,
            deletedAt: now.toISOString(),
            source: 'clerk_webhook',
          },
        });
      }
    }

    Sentry.addBreadcrumb({
      category: 'clerk-sync',
      message: 'Soft-deleted user from Clerk deletion event',
      level: 'info',
      data: { clerkUserId },
    });
    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    await captureError('Failed to handle Clerk user deletion', error, {
      component: 'clerk-sync',
      operation: 'user-deletion',
      clerkUserId,
    });

    return { success: false, error: errorMessage };
  }
}

/**
 * Helper: Get user ID from Clerk ID.
 * @internal Used by syncAdminRoleChange
 */
async function getUserIdByClerkId(clerkId: string): Promise<string | null> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  return user?.id ?? null;
}

/**
 * Helper: Log admin role change to audit log.
 * @internal Used by syncAdminRoleChange
 */
async function logAdminRoleChange(
  adminClerkUserId: string,
  targetClerkUserId: string,
  isAdmin: boolean,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  const adminUserId = await getUserIdByClerkId(adminClerkUserId);
  const targetUserId = await getUserIdByClerkId(targetClerkUserId);

  if (!adminUserId || !targetUserId) {
    return;
  }

  await db.insert(adminAuditLog).values({
    adminUserId,
    targetUserId,
    action: isAdmin ? 'admin_role_granted' : 'admin_role_revoked',
    metadata: {
      targetClerkUserId,
      newRole: isAdmin ? 'admin' : 'user',
      changedAt: new Date().toISOString(),
    },
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
  });
}

/**
 * Syncs admin role change to Clerk metadata and logs the action.
 *
 * @param targetClerkUserId - The Clerk user ID whose role is changing
 * @param isAdmin - The new admin status
 * @param adminClerkUserId - The admin making the change (for audit)
 * @param ipAddress - Optional IP address for audit
 * @param userAgent - Optional user agent for audit
 */
export async function syncAdminRoleChange(
  targetClerkUserId: string,
  isAdmin: boolean,
  adminClerkUserId?: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ success: boolean; error?: string }> {
  if (!targetClerkUserId) {
    return { success: false, error: 'Missing targetClerkUserId' };
  }

  try {
    // Sync the role change to Clerk
    const syncResult = await syncClerkMetadata(targetClerkUserId, {
      jovie_role: isAdmin ? 'admin' : 'user',
    });

    if (!syncResult.success) {
      return syncResult;
    }

    // Log the admin action if we have admin context
    if (adminClerkUserId) {
      await logAdminRoleChange(
        adminClerkUserId,
        targetClerkUserId,
        isAdmin,
        ipAddress,
        userAgent
      );
    }

    Sentry.addBreadcrumb({
      category: 'clerk-sync',
      message: 'Synced admin role change',
      level: 'info',
      data: { targetClerkUserId, isAdmin },
    });
    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    await captureError('Failed to sync admin role change to Clerk', error, {
      component: 'clerk-sync',
      operation: 'admin-role-change',
      targetClerkUserId,
      isAdmin,
    });

    return { success: false, error: errorMessage };
  }
}

/**
 * Syncs profile completion status to Clerk metadata.
 *
 * Called when a user completes onboarding.
 *
 * @param clerkUserId - The Clerk user ID
 * @param hasProfile - Whether the user has a complete profile
 */
export async function syncProfileStatus(
  clerkUserId: string,
  hasProfile: boolean
): Promise<{ success: boolean; error?: string }> {
  return syncClerkMetadata(clerkUserId, {
    jovie_has_profile: hasProfile,
  });
}

/**
 * Syncs user status change to Clerk metadata.
 *
 * Called when user status changes (banned, activated, etc.)
 *
 * @param clerkUserId - The Clerk user ID
 * @param status - The new status
 */
export async function syncUserStatus(
  clerkUserId: string,
  status: 'active' | 'pending' | 'banned'
): Promise<{ success: boolean; error?: string }> {
  return syncClerkMetadata(clerkUserId, {
    jovie_status: status,
  });
}

/**
 * Syncs email from Clerk to DB user record.
 *
 * Called from:
 * - resolveUserState() on auth check (if email changed)
 * - Webhook handler on user.updated event
 *
 * Clerk is the source of truth for identity (email, name, avatar).
 * This function ensures the DB stays in sync when email changes in Clerk.
 *
 * @param userId - Database user ID (NOT clerk ID)
 * @param newEmail - The verified email from Clerk
 */
export async function syncEmailFromClerk(
  userId: string,
  newEmail: string
): Promise<{ success: boolean; error?: string }> {
  if (!userId || !newEmail) {
    return { success: false, error: 'Missing userId or newEmail' };
  }

  try {
    await db
      .update(users)
      .set({ email: newEmail, updatedAt: new Date() })
      .where(eq(users.id, userId));

    Sentry.addBreadcrumb({
      category: 'clerk-sync',
      message: 'Synced email from Clerk',
      level: 'info',
      data: { userId, newEmail },
    });

    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    await captureError('Failed to sync email from Clerk', error, {
      component: 'clerk-sync',
      userId,
      newEmail,
    });

    return { success: false, error: errorMessage };
  }
}

/**
 * Syncs email from Clerk to DB user record by Clerk ID.
 *
 * Used by webhook handler which only has clerk_id available.
 *
 * @param clerkId - The Clerk user ID
 * @param newEmail - The verified email from Clerk
 */
export async function syncEmailFromClerkByClerkId(
  clerkId: string,
  newEmail: string
): Promise<{ success: boolean; error?: string }> {
  if (!clerkId || !newEmail) {
    return { success: false, error: 'Missing clerkId or newEmail' };
  }

  try {
    await db
      .update(users)
      .set({ email: newEmail, updatedAt: new Date() })
      .where(eq(users.clerkId, clerkId));

    Sentry.addBreadcrumb({
      category: 'clerk-sync',
      message: 'Synced email from Clerk by clerkId',
      level: 'info',
      data: { clerkId, newEmail },
    });

    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    await captureError('Failed to sync email from Clerk by clerkId', error, {
      component: 'clerk-sync',
      clerkId,
      newEmail,
    });

    return { success: false, error: errorMessage };
  }
}
