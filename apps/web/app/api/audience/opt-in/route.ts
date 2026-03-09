/**
 * Audience Marketing Opt-In API
 *
 * POST /api/audience/opt-in
 * Updates the marketing_opt_in flag for a tip audience member.
 *
 * GET /api/audience/opt-in?email=...&profileId=...
 * One-click opt-in from email CTA button (sets marketing_opt_in = true).
 */

import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { tipAudience } from '@/lib/db/schema/tip-audience';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const optInBodySchema = z.object({
  email: z.string().email(),
  profileId: z.string().uuid(),
  optIn: z.boolean(),
});

/**
 * POST handler — JSON body with { email, profileId, optIn }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = optInBodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { email, profileId, optIn } = parsed.data;

    const [updated] = await db
      .update(tipAudience)
      .set({
        marketingOptIn: optIn,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tipAudience.profileId, profileId),
          eq(tipAudience.email, email.toLowerCase().trim())
        )
      )
      .returning({ id: tipAudience.id });

    if (!updated) {
      return NextResponse.json(
        { error: 'Audience member not found' },
        { status: 404 }
      );
    }

    logger.info('Tip audience opt-in updated', {
      profileId,
      optIn,
      audienceId: updated.id,
    });

    return NextResponse.json({ success: true, optIn });
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
 * Redirects to a confirmation page after updating.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    const profileId = searchParams.get('profileId');

    if (!email || !profileId) {
      return new NextResponse(
        buildHtmlPage(
          'Invalid Link',
          'This opt-in link is invalid or expired.'
        ),
        {
          status: 400,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }
      );
    }

    const [updated] = await db
      .update(tipAudience)
      .set({
        marketingOptIn: true,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tipAudience.profileId, profileId),
          eq(tipAudience.email, email.toLowerCase().trim())
        )
      )
      .returning({ id: tipAudience.id });

    if (!updated) {
      return new NextResponse(
        buildHtmlPage(
          'Not Found',
          'We could not find your subscription record.'
        ),
        {
          status: 404,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }
      );
    }

    return new NextResponse(
      buildHtmlPage(
        "You're Subscribed!",
        "You'll now receive updates about upcoming shows and new releases. You can unsubscribe at any time from any email."
      ),
      {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    );
  } catch (error) {
    captureError('[audience] opt-in GET error', error);
    return new NextResponse(
      buildHtmlPage('Something went wrong', 'Please try again later.'),
      {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    );
  }
}

function buildHtmlPage(title: string, message: string): string {
  return `<!DOCTYPE html>
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
</html>`;
}
