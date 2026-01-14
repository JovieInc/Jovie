import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { invalidateAdminCache, requireAdmin } from '@/lib/admin';
import { syncAdminRoleChange } from '@/lib/auth/clerk-sync';
import { db } from '@/lib/db';
import { getUserByClerkId } from '@/lib/db/queries/shared';
import { users } from '@/lib/db/schema';
import { captureCriticalError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';
import { grantRoleSchema, revokeRoleSchema } from '@/lib/validation/schemas';

/**
 * POST /api/admin/roles
 * Grant admin role to a user
 *
 * Requires: Admin privileges
 * Body: { userId: string, role: 'admin' }
 */
export async function POST(request: Request) {
  // Require admin privileges
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const body = await request.json();
    const validation = grantRoleSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { userId: targetUserId } = validation.data;

    // Get user to verify they exist and get internal ID
    const user = await getUserByClerkId(db, targetUserId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update user's admin status
    await db
      .update(users)
      .set({
        isAdmin: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    const updatedUser = { id: user.id, clerkId: user.clerkId };

    // Invalidate cache for the target user
    invalidateAdminCache(targetUserId);

    // Get current admin user ID for logging
    const { userId: currentAdminId } = await auth();

    // Sync role change to Clerk metadata (best-effort)
    const headersList = await headers();
    const ipAddress =
      headersList.get('x-forwarded-for')?.split(',')[0] ?? undefined;
    const userAgent = headersList.get('user-agent') ?? undefined;

    try {
      await syncAdminRoleChange(
        targetUserId,
        true,
        currentAdminId ?? undefined,
        ipAddress,
        userAgent
      );
    } catch (syncError) {
      logger.warn(
        '[admin/roles] Failed to sync admin role to Clerk:',
        syncError
      );
      // Continue - Clerk sync is best-effort
    }

    logger.info(
      `[admin/roles] Admin role granted to user ${targetUserId} by ${currentAdminId}`
    );

    return NextResponse.json({
      success: true,
      message: 'Admin role granted successfully',
      user: {
        id: updatedUser.id,
        clerkId: updatedUser.clerkId,
        isAdmin: true,
      },
    });
  } catch (error) {
    logger.error('[admin/roles] Failed to grant admin role:', error);
    await captureCriticalError('Failed to grant admin role', error, {
      route: '/api/admin/roles',
      action: 'grant',
    });
    return NextResponse.json(
      { error: 'Failed to grant admin role' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/roles
 * Revoke admin role from a user
 *
 * Requires: Admin privileges
 * Body: { userId: string, role: 'admin' }
 */
export async function DELETE(request: Request) {
  // Require admin privileges
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const body = await request.json();
    const validation = revokeRoleSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { userId: targetUserId } = validation.data;
    const { userId: currentAdminId } = await auth();

    // Prevent self-revocation
    if (targetUserId === currentAdminId) {
      return NextResponse.json(
        { error: 'Cannot revoke your own admin privileges' },
        { status: 400 }
      );
    }

    // Get user to verify they exist and get internal ID
    const user = await getUserByClerkId(db, targetUserId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update user's admin status
    await db
      .update(users)
      .set({
        isAdmin: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    const updatedUser = { id: user.id, clerkId: user.clerkId };

    // Invalidate cache for the target user
    invalidateAdminCache(targetUserId);

    // Sync role change to Clerk metadata (best-effort)
    const headersList = await headers();
    const ipAddress =
      headersList.get('x-forwarded-for')?.split(',')[0] ?? undefined;
    const userAgent = headersList.get('user-agent') ?? undefined;

    try {
      await syncAdminRoleChange(
        targetUserId,
        false,
        currentAdminId ?? undefined,
        ipAddress,
        userAgent
      );
    } catch (syncError) {
      logger.warn(
        '[admin/roles] Failed to sync admin role revocation to Clerk:',
        syncError
      );
      // Continue - Clerk sync is best-effort
    }

    logger.info(
      `[admin/roles] Admin role revoked from user ${targetUserId} by ${currentAdminId}`
    );

    return NextResponse.json({
      success: true,
      message: 'Admin role revoked successfully',
      user: {
        id: updatedUser.id,
        clerkId: updatedUser.clerkId,
        isAdmin: false,
      },
    });
  } catch (error) {
    logger.error('[admin/roles] Failed to revoke admin role:', error);
    await captureCriticalError('Failed to revoke admin role', error, {
      route: '/api/admin/roles',
      action: 'revoke',
    });
    return NextResponse.json(
      { error: 'Failed to revoke admin role' },
      { status: 500 }
    );
  }
}
