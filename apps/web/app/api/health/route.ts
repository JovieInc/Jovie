export const runtime = 'nodejs';

import { sql as drizzleSql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { env } from '@/lib/env-server';
import { captureWarning } from '@/lib/error-tracking';
import { NO_STORE_HEADERS, RETRY_AFTER_HEALTH } from '@/lib/http/headers';
import {
  createRateLimitHeaders,
  getClientIP,
  healthLimiter,
} from '@/lib/rate-limit';
import { getRedis } from '@/lib/redis';

const REDIS_KEEPALIVE_TIMEOUT_MS = 2000;

/**
 * Issue one cheap Redis command per health invocation so the free-tier Upstash
 * DB never goes idle long enough (~14 days) to auto-archive. Archiving makes
 * every rate limiter error and fall back to in-memory, fanning out the
 * [CRITICAL] alert cluster (JOV-11962). Fail-soft and timeout-bounded — health
 * must stay green even when Redis is unreachable or unconfigured.
 */
async function pingRedisKeepalive(): Promise<void> {
  try {
    const redis = getRedis({
      signal: AbortSignal.timeout(REDIS_KEEPALIVE_TIMEOUT_MS),
    });
    await redis?.ping();
  } catch (error) {
    void captureWarning('Redis keepalive ping failed', error, {
      service: 'redis',
      route: '/api/health',
    });
  }
}

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
            ...NO_STORE_HEADERS,
            ...rateLimitHeaders,
          },
        }
      );
    }
  }

  // Keep the Upstash DB warm. Started here so it runs concurrently with the DB
  // check and never delays the happy path; awaited before each response so the
  // command is guaranteed to flush before the serverless function freezes.
  const keepalive = pingRedisKeepalive();

  // Minimal response - only status and timestamp (no environment details)
  const summary: Record<string, unknown> = {
    status: 'checking',
    timestamp: new Date().toISOString(),
  };

  try {
    const databaseUrl = env.DATABASE_URL;

    if (!databaseUrl) {
      await keepalive;
      summary.status = 'degraded';
      summary.database = 'unavailable';
      return NextResponse.json(summary, {
        status: 503, // Service Unavailable - allows monitoring to detect issues
        headers: { ...NO_STORE_HEADERS, 'Retry-After': RETRY_AFTER_HEALTH },
      });
    }

    // Pure connectivity check — SELECT 1 proves DB is reachable, no table dependency
    await db.execute(drizzleSql`SELECT 1`);

    await keepalive;

    // Success: return canonical {"status":"ok"} only (no timestamp/database).
    // 503 responses include extra diagnostic fields — the asymmetry is intentional.
    return NextResponse.json(
      { status: 'ok' },
      {
        status: 200,
        headers: {
          ...NO_STORE_HEADERS,
          ...rateLimitHeaders,
        },
      }
    );
  } catch (error) {
    await keepalive;
    void captureWarning('Health check degraded', error, {
      service: 'health',
      route: '/api/health',
    });
    summary.status = 'degraded';
    summary.database = 'error';
    return NextResponse.json(summary, {
      status: 503, // Service Unavailable - allows monitoring to detect issues
      headers: {
        ...NO_STORE_HEADERS,
        ...rateLimitHeaders,
        'Retry-After': RETRY_AFTER_HEALTH,
      },
    });
  }
}
