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
import { generalLimiter, getClientIP } from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const optInBodySchema = z.object({
  token: z.string().min(1),
  optIn: z.boolean(),
});

const HTML_HEADERS = { 'Content-Type': 'text/html; charset=utf-8' } as const;

function htmlResponse(title: string, message: string, status: number) {
  return new NextResponse(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; color: #333; }
    .card { background: #fff; padding: 48px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); max-width: 400px; text-align: center; }
    h1 { font-size: 24px; margin: 0 0 12px; }
    p { font-size: 16px; line-height: 1.5; color: #666; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`,
    { status, headers: HTML_HEADERS }
  );
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
      return htmlResponse('Too Many Requests', 'Please try again later.', 429);
    }

    const token = new URL(req.url).searchParams.get('token');
    if (!token) {
      return htmlResponse(
        'Invalid Link',
        'This opt-in link is invalid or expired.',
        400
      );
    }

    const verified = verifyOptInToken(token);
    if (!verified) {
      return htmlResponse(
        'Invalid Link',
        'This opt-in link is invalid or expired.',
        403
      );
    }

    const updated = await applyOptIn(verified.email, verified.profileId, true);
    if (!updated) {
      return htmlResponse(
        'Not Found',
        'We could not find your subscription record.',
        404
      );
    }

    return htmlResponse(
      "You're Subscribed!",
      "You'll now receive updates about upcoming shows and new releases. You can unsubscribe at any time from any email.",
      200
    );
  } catch (error) {
    captureError('[audience] opt-in GET error', error);
    return htmlResponse('Something went wrong', 'Please try again later.', 500);
  }
}
