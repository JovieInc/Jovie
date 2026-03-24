import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { captureCriticalError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

let lastPromoteTimestamp = 0;
const RATE_LIMIT_MS = 60_000;

/**
 * POST /api/deploy/promote
 * Trigger a production deployment via Vercel Deploy Hook.
 *
 * Requires: Admin privileges
 * Rate limit: 1 per 60 seconds (in-memory)
 */
export async function POST() {
  const authError = await requireAdmin();
  if (authError) return authError;

  // Rate limit
  const now = Date.now();
  if (now - lastPromoteTimestamp < RATE_LIMIT_MS) {
    const retryAfter = Math.ceil(
      (RATE_LIMIT_MS - (now - lastPromoteTimestamp)) / 1000
    );
    return NextResponse.json(
      { error: 'Too many requests. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  const hookUrl = process.env.VERCEL_PRODUCTION_DEPLOY_HOOK;
  if (!hookUrl) {
    return NextResponse.json(
      { error: 'Deploy hook not configured' },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(hookUrl, { method: 'POST' });

    if (!response.ok) {
      const body = await response.text().catch(() => 'unknown');
      throw new Error(
        `Deploy hook returned ${response.status}: ${body.slice(0, 200)}`
      );
    }

    lastPromoteTimestamp = Date.now();

    const { userId } = await auth();
    logger.info(
      `[deploy/promote] Production deploy triggered by ${userId ?? 'unknown'}`
    );

    const data = await response.json().catch(() => ({}));

    return NextResponse.json({
      success: true,
      message: 'Production deploy triggered',
      job: data,
    });
  } catch (error) {
    logger.error(
      '[deploy/promote] Failed to trigger production deploy:',
      error
    );
    await captureCriticalError('Failed to trigger production deploy', error, {
      route: '/api/deploy/promote',
    });
    return NextResponse.json(
      { error: 'Failed to trigger production deploy' },
      { status: 500 }
    );
  }
}
