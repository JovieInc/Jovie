import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin';
import { verifyCronRequest } from '@/lib/cron/auth';
import { captureWarning } from '@/lib/error-tracking';
import { RETRY_AFTER_HEALTH } from '@/lib/http/headers';
import {
  probeRedisOperability,
  RedisOperabilityError,
} from '@/lib/redis-operability';

/**
 * GET /api/health/redis
 * Health check endpoint for Redis operability
 *
 * Returns:
 * - 401/403: Caller is neither an authenticated admin nor trusted automation
 * - 200: Redis is healthy and responding
 * - 503: Redis is unavailable or not configured
 */
export async function GET(request: Request) {
  const machineAuthError = verifyCronRequest(request, {
    route: '/api/health/redis',
  });
  if (machineAuthError) {
    const adminAuthError = await requireAdmin();
    if (adminAuthError) return adminAuthError;
  }

  try {
    const result = await probeRedisOperability();

    return NextResponse.json({
      ...result,
      latency: result.latencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    void captureWarning('Redis health check failed', error, {
      service: 'redis',
      route: '/api/health/redis',
      error_class:
        error instanceof RedisOperabilityError
          ? `redis_operability_${error.kind}`
          : 'redis_operability_unavailable',
    });
    const failureKind =
      error instanceof RedisOperabilityError ? error.kind : 'unavailable';
    return NextResponse.json(
      {
        status: failureKind === 'not_configured' ? 'unavailable' : 'unhealthy',
        error:
          failureKind === 'not_configured'
            ? 'Redis not configured'
            : failureKind,
        failureKind,
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { 'Retry-After': RETRY_AFTER_HEALTH } }
    );
  }
}
