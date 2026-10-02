export const runtime = 'nodejs';

import { sql as drizzleSql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { env } from '@/lib/env-server';
import { captureWarning } from '@/lib/error-tracking';
import {
  canReadHealthDetail,
  HEALTH_DETAIL_HEADERS,
  publicHealthLiveness,
} from '@/lib/health/detail-access';
import { RETRY_AFTER_HEALTH } from '@/lib/http/headers';
import {
  createRateLimitHeaders,
  getClientIP,
  healthLimiter,
} from '@/lib/rate-limit';

function hasTrustedAutomationBypass(request: Request): boolean {
  const configuredSecret = env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (!configuredSecret) return false;

  const providedSecret = request.headers
    .get('x-vercel-protection-bypass')
    ?.trim();
  return providedSecret === configuredSecret;
}

/**
 * Health check endpoint for uptime monitoring and deployment verification.
 *
 * Security considerations:
 * - Rate limited to prevent abuse (30 req/60s per IP)
 * - Only exposes minimal non-sensitive information
 * - No CORS headers to prevent unauthorized cross-origin access
 */
export async function GET(request: Request) {
  const bypassRateLimit = hasTrustedAutomationBypass(request);
  let rateLimitHeaders: Record<string, string> = {};

  if (!bypassRateLimit) {
    // Rate limit check (30 req/60s for health endpoints)
    const clientIP = getClientIP(request);
    const rateLimitResult = await healthLimiter.limit(clientIP);

    rateLimitHeaders = createRateLimitHeaders(rateLimitResult);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: 'Too many requests',
          retryAfter: Math.max(
            0,
            Math.ceil((rateLimitResult.reset.getTime() - Date.now()) / 1000)
          ),
        },
        {
          status: 429,
          headers: {
            ...HEALTH_DETAIL_HEADERS,
            ...rateLimitHeaders,
          },
        }
      );
    }
  }

  const timestamp = new Date().toISOString();
  const authorized = await canReadHealthDetail(request, '/api/health');

  try {
    const databaseUrl = env.DATABASE_URL;

    if (!databaseUrl) {
      if (!authorized) {
        return publicHealthLiveness(false, rateLimitHeaders);
      }
      return NextResponse.json(
        { healthy: false, timestamp, database: 'unavailable' },
        {
          status: 503,
          headers: {
            ...HEALTH_DETAIL_HEADERS,
            ...rateLimitHeaders,
            'Retry-After': RETRY_AFTER_HEALTH,
          },
        }
      );
    }

    // Pure connectivity check — SELECT 1 proves DB is reachable, no table dependency.
    // Success stays {"status":"ok"} so production admission (isProductionRed) and
    // external uptime checks keep working across the deploy.
    await db.execute(drizzleSql`SELECT 1`);

    return NextResponse.json(
      { status: 'ok' },
      {
        status: 200,
        headers: {
          ...HEALTH_DETAIL_HEADERS,
          ...rateLimitHeaders,
        },
      }
    );
  } catch (error) {
    void captureWarning('Health check degraded', error, {
      service: 'health',
      route: '/api/health',
    });
    if (!authorized) {
      return publicHealthLiveness(false, rateLimitHeaders);
    }
    return NextResponse.json(
      { healthy: false, timestamp, database: 'error' },
      {
        status: 503,
        headers: {
          ...HEALTH_DETAIL_HEADERS,
          ...rateLimitHeaders,
          'Retry-After': RETRY_AFTER_HEALTH,
        },
      }
    );
  }
}
