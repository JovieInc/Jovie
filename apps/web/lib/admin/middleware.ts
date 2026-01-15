import 'server-only';
import crypto from 'crypto';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { isAdmin } from './roles';

/**
 * Mask user ID for logging to prevent PII exposure while maintaining correlation.
 * Format: first 4 chars + hash suffix for audit trail correlation
 */
function maskUserIdForLog(userId: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(userId)
    .digest('hex')
    .substring(0, 8);
  return `${userId.substring(0, 4)}...${hash}`;
}

/**
 * Admin route protection middleware
 *
 * Verifies that the current user has admin privileges before allowing access.
 * Returns 403 Forbidden if user is not an admin.
 *
 * Usage in API routes:
 * ```typescript
 * import { requireAdmin } from '@/lib/admin/middleware';
 *
 * export async function GET(request: Request) {
 *   const authError = await requireAdmin();
 *   if (authError) return authError;
 *
 *   // Admin-only logic here
 * }
 * ```
 *
 * @returns NextResponse with 403 status if not admin, null if authorized
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const { userId } = await auth();

  // User not authenticated
  if (!userId) {
    console.warn(
      '[admin/middleware] Unauthorized admin access attempt - no user ID'
    );
    return NextResponse.json(
      { error: 'Unauthorized. Please sign in.' },
      { status: 401 }
    );
  }

  // Check admin status
  const userIsAdmin = await isAdmin(userId);

  // Mask user ID for logging to prevent PII exposure
  const maskedUserId = maskUserIdForLog(userId);

  if (!userIsAdmin) {
    // Log unauthorized access attempt with masked ID
    console.warn(
      `[admin/middleware] Forbidden admin access attempt by user: ${maskedUserId}`
    );

    return NextResponse.json(
      { error: 'Forbidden. Admin privileges required.' },
      { status: 403 }
    );
  }

  // Log successful admin access with masked ID (for audit trail)
  console.log(`[admin/middleware] Admin access granted to user: ${maskedUserId}`);

  // Authorization successful
  return null;
}

/**
 * Check if current user is admin without throwing errors
 *
 * Useful for conditional UI rendering in server components
 *
 * @returns Promise<boolean> - True if user is admin
 */
export async function checkIsAdmin(): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) return false;
  return isAdmin(userId);
}
