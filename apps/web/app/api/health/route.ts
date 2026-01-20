export const runtime = 'nodejs';

import { count, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema';
import { env } from '@/lib/env-server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientIP,
  getRateLimitStatus,
} from '@/lib/utils/rate-limit';

/**
 * Health check endpoint for uptime monitoring and deployment verification.
 *
 * Security considerations:
 * - Rate limited to prevent abuse (30 req/60s per IP)
 * - Only exposes minimal non-sensitive information
 * - No CORS headers to prevent unauthorized cross-origin access
 */
export async function GET(request: Request) {
  // Rate limit check (30 req/60s for health endpoints)
  const clientIP = getClientIP(request);
  const isRateLimited = checkRateLimit(clientIP, true);

  if (isRateLimited) {
    const status = getRateLimitStatus(clientIP, true);
    return NextResponse.json(
      {
        error: 'Too many requests',
        retryAfter: Math.ceil((status.resetTime - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          ...createRateLimitHeaders(status),
        },
      }
    );
  }

  // Minimal response - only status and timestamp (no environment details)
  const summary: Record<string, unknown> = {
    status: 'checking',
    timestamp: new Date().toISOString(),
  };

  try {
    const databaseUrl = env.DATABASE_URL;

    if (!databaseUrl) {
      summary.status = 'degraded';
      summary.database = 'unavailable';
      return NextResponse.json(summary, {
        status: 503, // Service Unavailable - allows monitoring to detect issues
        headers: NO_STORE_HEADERS,
      });
    }

    // Count public creator profiles (seed invariant: should be >= 3)
    const result = await db
      .select({ count: count() })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.isPublic, true));

    const profileCount = result[0]?.count ?? 0;

    summary.status = 'ok';
    summary.database = profileCount >= 3 ? 'ok' : 'degraded';
    return NextResponse.json(summary, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch {
    summary.status = 'degraded';
    summary.database = 'error';
    return NextResponse.json(summary, {
      status: 503, // Service Unavailable - allows monitoring to detect issues
      headers: NO_STORE_HEADERS,
    });
  }
}
