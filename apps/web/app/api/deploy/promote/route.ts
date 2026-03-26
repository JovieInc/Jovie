import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { captureCriticalError } from '@/lib/error-tracking';
import { ServerFetchTimeoutError, serverFetch } from '@/lib/http/server-fetch';
import { createRateLimitHeaders, deployPromoteLimiter } from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const RATE_LIMIT_SECONDS = 60;

function isLimiterUnavailable(reason: string | undefined): boolean {
  return reason?.includes('temporarily unavailable') ?? false;
}

/**
 * POST /api/deploy/promote
 * Trigger a production deployment via Vercel Deploy Hook.
 *
 * Requires: Admin privileges
 * Rate limit: 1 per 60 seconds (Redis-backed in production)
 */
export async function POST() {
  const { userId } = await auth();

  const authError = await requireAdmin();
  if (authError) return authError;

  const rateLimitResult = await deployPromoteLimiter.limit(
    'deploy:promote:production'
  );
  if (!rateLimitResult.success) {
    const status = isLimiterUnavailable(rateLimitResult.reason) ? 503 : 429;
    return NextResponse.json(
      {
        error:
          status === 503
            ? 'Deploy promotion is temporarily unavailable.'
            : 'Too many requests. Try again shortly.',
      },
      {
        status,
        headers: {
          ...NO_STORE_HEADERS,
          ...createRateLimitHeaders(rateLimitResult),
          ...(status === 503
            ? { 'Retry-After': String(RATE_LIMIT_SECONDS) }
            : {}),
        },
      }
    );
  }

  const hookUrl = process.env.VERCEL_PRODUCTION_DEPLOY_HOOK;
  if (!hookUrl) {
    return NextResponse.json(
      { error: 'Deploy hook not configured' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const response = await serverFetch(hookUrl, {
      method: 'POST',
      timeoutMs: 30_000,
      context: 'Vercel production deploy hook',
      retry: {
        maxRetries: 1,
        baseDelayMs: 500,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => 'unknown');
      throw new Error(
        `Deploy hook returned ${response.status}: ${body.slice(0, 200)}`
      );
    }

    logger.info(
      `[deploy/promote] Production deploy triggered by ${userId ?? 'unknown'}`
    );

    const data = await response.json().catch(() => ({}));

    return NextResponse.json(
      {
        success: true,
        message: 'Production deploy triggered',
        job: data,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof ServerFetchTimeoutError) {
      await captureCriticalError('Production deploy trigger timed out', error, {
        route: '/api/deploy/promote',
        timeoutMs: error.timeoutMs,
      });
      return NextResponse.json(
        { error: 'Production deploy trigger timed out' },
        { status: 504, headers: NO_STORE_HEADERS }
      );
    }

    logger.error(
      '[deploy/promote] Failed to trigger production deploy:',
      error
    );
    await captureCriticalError('Failed to trigger production deploy', error, {
      route: '/api/deploy/promote',
    });
    return NextResponse.json(
      { error: 'Failed to trigger production deploy' },
      { status: 502, headers: NO_STORE_HEADERS }
    );
  }
}
