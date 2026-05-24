import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClientTrackingToken } from '@/lib/analytics/tracking-token';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { publicVisitLimiter } from '@/lib/rate-limit';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import { logger } from '@/lib/utils/logger';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const requestSchema = z.object({
  profileId: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const parsed = requestSchema.safeParse({
    profileId: url.searchParams.get('profileId'),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  // Public, unauthenticated endpoint. Without a rate limiter anyone can mint
  // valid tracking tokens for any profile UUID at unbounded volume — see PR
  // #7986 review. Reuse the per-IP visit limiter so the issuance ceiling
  // matches the downstream `/api/audience/visit` ceiling.
  const clientIP = extractClientIP(request.headers);
  const rateLimitResult = await publicVisitLimiter.limit(clientIP);
  if (!rateLimitResult.success) {
    const retryAfterSeconds = Math.max(
      Math.ceil((rateLimitResult.reset.getTime() - Date.now()) / 1000),
      1
    );
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          'Retry-After': String(retryAfterSeconds),
          'X-RateLimit-Limit': String(rateLimitResult.limit),
          'X-RateLimit-Remaining': String(rateLimitResult.remaining),
        },
      }
    );
  }

  // Bind issuance to a real profile. Without this guard a caller can submit
  // any UUID and receive a valid token, enabling targeted visit-count
  // inflation against profiles that were never actually loaded.
  try {
    const [profile] = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, parsed.data.profileId))
      .limit(1);

    if (!profile) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }
  } catch (error) {
    logger.error('[visit-token] profile lookup failed', error);
    await captureError('visit-token profile lookup failed', error, {
      route: '/api/audience/visit-token',
    });
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  try {
    return NextResponse.json(getClientTrackingToken(parsed.data.profileId), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    // Don't swallow signing failures silently — analytics loss must be
    // visible in telemetry. Return the prior fallback shape so existing
    // clients (which read `token` defensively) still degrade gracefully.
    logger.error('[visit-token] signing failed', error);
    await captureError('visit-token signing failed', error, {
      route: '/api/audience/visit-token',
    });
    return NextResponse.json(
      { token: null, expiresAt: null },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
