/**
 * Audience Marketing Opt-In API
 *
 * POST /api/audience/opt-in
 * Updates the marketing_opt_in flag for a tip audience member.
 * Requires a signed token to prevent unauthenticated manipulation.
 *
 * GET /api/audience/opt-in?token=...
 * One-click opt-in from email CTA button (sets marketing_opt_in = true).
 * Token is HMAC-signed to prevent URL forgery.
 */

import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { recordAudienceEvent } from '@/lib/audience/record-audience-event';
import { db } from '@/lib/db';
import { audienceMembers } from '@/lib/db/schema/analytics';
import { tipAudience } from '@/lib/db/schema/tip-audience';
import { verifyOptInToken } from '@/lib/email/opt-in-token';
import { captureError } from '@/lib/error-tracking';
import { renderStandalonePage } from '@/lib/html/standalone-page';
import { generalLimiter, getClientIP } from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const optInBodySchema = z.object({
  token: z.string().min(1),
  optIn: z.boolean(),
});

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
} as const;

function htmlResponse(
  title: string,
  message: string,
  status: number,
  tone: 'neutral' | 'success' | 'error' = 'neutral'
) {
  return new NextResponse(renderStandalonePage({ title, message, tone }), {
    status,
    headers: HTML_HEADERS,
  });
}

async function applyOptIn(email: string, profileId: string, optIn: boolean) {
  const [existing] = await db
    .select({
      id: tipAudience.id,
      marketingOptIn: tipAudience.marketingOptIn,
    })
    .from(tipAudience)
    .where(
      and(eq(tipAudience.profileId, profileId), eq(tipAudience.email, email))
    )
    .limit(1);

  if (!existing) return null;

  const [updated] = await db
    .update(tipAudience)
    .set({ marketingOptIn: optIn, updatedAt: new Date() })
    .where(eq(tipAudience.id, existing.id))
    .returning({ id: tipAudience.id });
  if (updated && optIn && !existing.marketingOptIn) {
    const [member] = await db
      .select({ id: audienceMembers.id })
      .from(audienceMembers)
      .where(
        and(
          eq(audienceMembers.creatorProfileId, profileId),
          eq(audienceMembers.email, email)
        )
      )
      .limit(1);

    if (member) {
      try {
        await recordAudienceEvent(db, {
          creatorProfileId: profileId,
          audienceMemberId: member.id,
          eventType: 'subscription_created',
          verb: 'subscribed',
          confidence: 'verified',
          sourceKind: 'email',
          sourceLabel: 'Email',
          objectType: 'profile',
          objectId: profileId,
          objectLabel: 'Profile',
          properties: { email },
        });
      } catch (error) {
        logger.error('[audience] Failed to record subscription_created event', {
          email,
          profileId,
          error,
        });
        void captureError('opt-in audience event failed', error, {
          profileId,
          email,
        });
      }
    }
  }
  return updated ?? null;
}

/**
 * POST handler — JSON body with { token, optIn }
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const rl = await generalLimiter.limit(ip);
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body = await req.json();
    const parsed = optInBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const verified = verifyOptInToken(parsed.data.token);
    if (!verified) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 403 }
      );
    }

    const updated = await applyOptIn(
      verified.email,
      verified.profileId,
      parsed.data.optIn
    );
    if (!updated) {
      return NextResponse.json(
        { error: 'Audience member not found' },
        { status: 404 }
      );
    }

    logger.info('Tip audience opt-in updated', {
      profileId: verified.profileId,
      optIn: parsed.data.optIn,
      audienceId: updated.id,
    });

    return NextResponse.json({ success: true, optIn: parsed.data.optIn });
  } catch (error) {
    captureError('[audience] opt-in error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET handler — one-click opt-in from email CTA
 */
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const rl = await generalLimiter.limit(ip);
    if (!rl.success) {
      return htmlResponse(
        'Too Many Requests',
        'Please try again later.',
        429,
        'error'
      );
    }

    const token = new URL(req.url).searchParams.get('token');
    if (!token) {
      return htmlResponse(
        'Invalid Link',
        'This opt-in link is invalid or expired.',
        400,
        'error'
      );
    }

    const verified = verifyOptInToken(token);
    if (!verified) {
      return htmlResponse(
        'Invalid Link',
        'This opt-in link is invalid or expired.',
        403,
        'error'
      );
    }

    const updated = await applyOptIn(verified.email, verified.profileId, true);
    if (!updated) {
      return htmlResponse(
        'Not Found',
        'We could not find your subscription record.',
        404,
        'error'
      );
    }

    return htmlResponse(
      "You're Subscribed!",
      "You'll now receive updates about upcoming shows and new releases. You can unsubscribe at any time from any email.",
      200,
      'success'
    );
  } catch (error) {
    captureError('[audience] opt-in GET error', error);
    return htmlResponse(
      'Something went wrong',
      'Please try again later.',
      500,
      'error'
    );
  }
}
