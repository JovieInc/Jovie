import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { createScopedLogger } from '@/lib/utils/logger';
import { isAdmin } from './roles';

const log = createScopedLogger('Admin');

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
    log.warn('Unauthorized admin access attempt - no user ID');
    return NextResponse.json(
      { error: 'Unauthorized. Please sign in.' },
      { status: 401 }
    );
  }

  // Check admin status
  const userIsAdmin = await isAdmin(userId);

  if (!userIsAdmin) {
    // Log unauthorized access attempt
    log.warn('Forbidden admin access attempt', { userId });

    return NextResponse.json(
      { error: 'Forbidden. Admin privileges required.' },
      { status: 403 }
    );
  }

  // Log successful admin access (for audit trail)
  log.info('Admin access granted', { userId });

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
