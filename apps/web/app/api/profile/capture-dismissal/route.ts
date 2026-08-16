import { and, eq, gt } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRateLimitedResponse } from '@/app/api/notifications/route-helpers';
import { AUDIENCE_ANON_COOKIE } from '@/constants/app';
import { db } from '@/lib/db';
import { publicProfileCaptureDismissals } from '@/lib/db/schema/analytics';
import { isSecureEnv } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import {
  getClientIP,
  publicProfileCaptureDismissalLimiter,
} from '@/lib/rate-limit';
import { uuidSchema } from '@/lib/validation/schemas/base';

export const runtime = 'nodejs';

const DISMISSAL_DAYS = 7;
const DISMISSAL_SESSION_CAP = 3;
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const dismissalSchema = z.object({
  artist_id: uuidSchema,
  source: z.string().min(1).max(80).optional(),
});

function isRateLimitBackendDegraded(result: {
  readonly degraded?: boolean;
  readonly unavailable?: boolean;
}) {
  return result.degraded === true || result.unavailable === true;
}

function degradedGetResponse() {
  return NextResponse.json(
    {
      success: true,
      suppressed: false,
      sessionCount: 0,
      nextEligibleAt: null,
      degraded: true,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

function degradedPostResponse(nextEligibleAt: Date) {
  return NextResponse.json(
    {
      success: true,
      accepted: true,
      suppressed: true,
      persisted: false,
      degraded: true,
      nextEligibleAt: nextEligibleAt.toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

function buildNextEligibleAt(now = new Date()) {
  return new Date(now.getTime() + DISMISSAL_DAYS * 24 * 60 * 60 * 1000);
}

async function resolveAudienceId() {
  const cookieStore = await cookies();
  const existing = cookieStore.get(AUDIENCE_ANON_COOKIE)?.value;
  if (existing) return { audienceId: existing, shouldSetCookie: false };

  const audienceId = crypto.randomUUID();
  return { audienceId, shouldSetCookie: true };
}

function setAudienceCookie(response: NextResponse, audienceId: string) {
  response.cookies.set(AUDIENCE_ANON_COOKIE, audienceId, {
    httpOnly: true,
    secure: isSecureEnv(),
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: '/',
  });
}

export async function GET(request: NextRequest) {
  const clientIp = getClientIP(request);
  const rateLimitResult =
    await publicProfileCaptureDismissalLimiter.limit(clientIp);

  const backendDegraded = isRateLimitBackendDegraded(rateLimitResult);
  if (!rateLimitResult.success && !backendDegraded) {
    return createRateLimitedResponse(rateLimitResult);
  }

  const parsed = dismissalSchema.pick({ artist_id: true }).safeParse({
    artist_id: request.nextUrl.searchParams.get('artist_id'),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid request data' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // An Upstash outage must not turn an optional conversion control into a
  // visible 429. Return a neutral state without touching the database; the
  // per-instance fallback still bounds CPU while the backend is degraded.
  if (backendDegraded) {
    return degradedGetResponse();
  }

  const { audienceId, shouldSetCookie } = await resolveAudienceId();
  const now = new Date();

  try {
    const [dismissal] = await db
      .select({
        id: publicProfileCaptureDismissals.id,
        sessionCount: publicProfileCaptureDismissals.sessionCount,
        nextEligibleAt: publicProfileCaptureDismissals.nextEligibleAt,
      })
      .from(publicProfileCaptureDismissals)
      .where(
        and(
          eq(
            publicProfileCaptureDismissals.creatorProfileId,
            parsed.data.artist_id
          ),
          eq(publicProfileCaptureDismissals.audienceId, audienceId),
          gt(publicProfileCaptureDismissals.nextEligibleAt, now)
        )
      )
      .limit(1);

    const suppressed = Boolean(
      dismissal && dismissal.sessionCount < DISMISSAL_SESSION_CAP
    );

    if (dismissal && suppressed) {
      await db
        .update(publicProfileCaptureDismissals)
        .set({
          sessionCount: dismissal.sessionCount + 1,
          updatedAt: now,
        })
        .where(eq(publicProfileCaptureDismissals.id, dismissal.id));
    }

    const response = NextResponse.json(
      {
        success: true,
        suppressed,
        sessionCount: dismissal?.sessionCount ?? 0,
        nextEligibleAt: dismissal?.nextEligibleAt?.toISOString() ?? null,
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
    if (shouldSetCookie) {
      setAudienceCookie(response, audienceId);
    }
    return response;
  } catch (error) {
    await captureError('Profile capture dismissal status failed', error, {
      artistId: parsed.data.artist_id,
    });
    return NextResponse.json(
      { success: false, error: 'Unable to load dismissal state' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function POST(request: NextRequest) {
  const clientIp = getClientIP(request);
  const rateLimitResult =
    await publicProfileCaptureDismissalLimiter.limit(clientIp);

  const backendDegraded = isRateLimitBackendDegraded(rateLimitResult);
  if (!rateLimitResult.success && !backendDegraded) {
    return createRateLimitedResponse(rateLimitResult);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid request data' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const parsed = dismissalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid request data' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const now = new Date();
  const nextEligibleAt = buildNextEligibleAt(now);

  // The client suppresses the capture immediately in memory. A successful
  // degraded response preserves that preference while avoiding DB write
  // amplification when the durable abuse-control backend is unavailable.
  if (backendDegraded) {
    return degradedPostResponse(nextEligibleAt);
  }

  const { audienceId, shouldSetCookie } = await resolveAudienceId();

  try {
    await db
      .insert(publicProfileCaptureDismissals)
      .values({
        creatorProfileId: parsed.data.artist_id,
        audienceId,
        sessionCount: 0,
        source: parsed.data.source,
        dismissedAt: now,
        nextEligibleAt,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          publicProfileCaptureDismissals.creatorProfileId,
          publicProfileCaptureDismissals.audienceId,
        ],
        set: {
          sessionCount: 0,
          source: parsed.data.source,
          dismissedAt: now,
          nextEligibleAt,
          updatedAt: now,
        },
      });

    const response = NextResponse.json(
      {
        success: true,
        accepted: true,
        suppressed: true,
        persisted: true,
        sessionCap: DISMISSAL_SESSION_CAP,
        nextEligibleAt: nextEligibleAt.toISOString(),
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
    if (shouldSetCookie) {
      setAudienceCookie(response, audienceId);
    }
    return response;
  } catch (error) {
    await captureError('Profile capture dismissal persist failed', error, {
      artistId: parsed.data.artist_id,
    });
    return NextResponse.json(
      { success: false, error: 'Unable to save dismissal' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
