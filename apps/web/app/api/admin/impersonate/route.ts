import { auth } from '@clerk/nextjs/server';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin';
import {
  endImpersonation,
  getImpersonationState,
  getImpersonationTimeRemaining,
  isImpersonationEnabled,
  startImpersonation,
} from '@/lib/admin/impersonation';
import { captureCriticalError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

const StartImpersonationSchema = z.object({
  targetClerkId: z.string().min(1, 'Target user ID is required'),
});

/**
 * GET /api/admin/impersonate
 * Get current impersonation status
 *
 * Requires: Admin privileges
 * Returns: Current impersonation state including time remaining
 */
export async function GET() {
  // Require admin privileges
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    if (!isImpersonationEnabled()) {
      return NextResponse.json({
        enabled: false,
        isImpersonating: false,
        message: 'Impersonation is disabled in this environment',
      });
    }

    const state = await getImpersonationState();
    const timeRemaining = await getImpersonationTimeRemaining();

    if (!state) {
      return NextResponse.json({
        enabled: true,
        isImpersonating: false,
      });
    }

    return NextResponse.json({
      enabled: true,
      isImpersonating: true,
      realAdminClerkId: state.realAdminClerkId,
      effectiveClerkId: state.effectiveClerkId,
      effectiveDbId: state.effectiveDbId,
      issuedAt: state.issuedAt,
      expiresAt: state.expiresAt,
      timeRemainingMs: timeRemaining,
      timeRemainingMinutes: Math.floor(timeRemaining / 60000),
    });
  } catch (error) {
    logger.error(
      '[admin/impersonate] Failed to get impersonation status:',
      error
    );
    await captureCriticalError('Failed to get impersonation status', error, {
      route: '/api/admin/impersonate',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Failed to get impersonation status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/impersonate
 * Start impersonating a user
 *
 * Requires: Admin privileges
 * Body: { targetClerkId: string }
 */
export async function POST(request: Request) {
  // Require admin privileges
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    if (!isImpersonationEnabled()) {
      return NextResponse.json(
        {
          error: 'Impersonation is disabled',
          message:
            'Impersonation is disabled in this environment. Set ENABLE_IMPERSONATION=true in production or ensure IMPERSONATION_SECRET/URL_ENCRYPTION_KEY is set.',
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validation = StartImpersonationSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { targetClerkId } = validation.data;
    const { userId: adminClerkId } = await auth();

    if (!adminClerkId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get request metadata for audit logging
    const headersList = await headers();
    const ipAddress =
      headersList.get('x-forwarded-for')?.split(',')[0] ?? undefined;
    const userAgent = headersList.get('user-agent') ?? undefined;

    const result = await startImpersonation(
      adminClerkId,
      targetClerkId,
      ipAddress,
      userAgent
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    logger.info(
      `[admin/impersonate] Impersonation started: admin=${adminClerkId} target=${targetClerkId}`
    );

    return NextResponse.json({
      success: true,
      message: 'Impersonation session started',
      targetClerkId,
      expiresInMinutes: 15,
    });
  } catch (error) {
    logger.error('[admin/impersonate] Failed to start impersonation:', error);
    await captureCriticalError('Failed to start impersonation', error, {
      route: '/api/admin/impersonate',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Failed to start impersonation' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/impersonate
 * End the current impersonation session
 *
 * Requires: Admin privileges (verified via cookie token)
 */
export async function DELETE() {
  // Require admin privileges
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    // Get request metadata for audit logging
    const headersList = await headers();
    const ipAddress =
      headersList.get('x-forwarded-for')?.split(',')[0] ?? undefined;
    const userAgent = headersList.get('user-agent') ?? undefined;

    const result = await endImpersonation(ipAddress, userAgent);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Failed to end impersonation' },
        { status: 500 }
      );
    }

    logger.info('[admin/impersonate] Impersonation session ended');

    return NextResponse.json({
      success: true,
      message: 'Impersonation session ended',
    });
  } catch (error) {
    logger.error('[admin/impersonate] Failed to end impersonation:', error);
    await captureCriticalError('Failed to end impersonation', error, {
      route: '/api/admin/impersonate',
      method: 'DELETE',
    });
    return NextResponse.json(
      { error: 'Failed to end impersonation' },
      { status: 500 }
    );
  }
}
