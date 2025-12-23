import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidateAdminCache, requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

const GrantRoleSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  role: z.literal('admin'), // Currently only support admin role
});

const RevokeRoleSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  role: z.literal('admin'),
});

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
    const validation = GrantRoleSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { userId: targetUserId } = validation.data;

    // Update user's admin status
    const [updatedUser] = await db
      .update(users)
      .set({
        isAdmin: true,
        updatedAt: new Date(),
      })
      .where(eq(users.clerkId, targetUserId))
      .returning({ id: users.id, clerkId: users.clerkId });

    if (!updatedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Invalidate cache for the target user
    invalidateAdminCache(targetUserId);

    // Get current admin user ID for logging
    const { userId: currentAdminId } = await auth();

    console.log(
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
    console.error('[admin/roles] Failed to grant admin role:', error);
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
    const validation = RevokeRoleSchema.safeParse(body);

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

    // Update user's admin status
    const [updatedUser] = await db
      .update(users)
      .set({
        isAdmin: false,
        updatedAt: new Date(),
      })
      .where(eq(users.clerkId, targetUserId))
      .returning({ id: users.id, clerkId: users.clerkId });

    if (!updatedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Invalidate cache for the target user
    invalidateAdminCache(targetUserId);

    console.log(
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
    console.error('[admin/roles] Failed to revoke admin role:', error);
    return NextResponse.json(
      { error: 'Failed to revoke admin role' },
      { status: 500 }
    );
  }
}
