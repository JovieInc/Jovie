import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { investorLinks, investorViews } from '@/lib/db/schema/investors';
import { captureError } from '@/lib/error-tracking';
import {
  isInvestorClaimTokenShape,
  isInvestorClaimUnexpired,
} from '@/lib/investors/claim-token';
import { apiLimiter } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/** Schema for the duration-heartbeat tracking body. */
const trackInvestorViewSchema = z.object({
  token: z.string().min(1),
  pagePath: z.string().min(1),
  durationHintMs: z.number().int().positive(),
});

/**
 * POST /api/investors/track
 *
 * Duration heartbeat only — updates duration_hint_ms on the most recent view.
 * New views are recorded by proxy.ts middleware (not this endpoint).
 *
 * Body: { token, pagePath, durationHintMs }
 */
export async function POST(request: Request) {
  try {
    const parsed = trackInvestorViewSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }
    const { token, pagePath, durationHintMs } = parsed.data;

    if (!isInvestorClaimTokenShape(token)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Per-IP abuse cap (JOV-8888): unauthenticated endpoint doing DB
    // lookups must not be enumerable at scale. Same pattern as the events
    // route: shape-check first, then the limiter, then the database.
    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      'unknown';
    const rateLimit = await apiLimiter.limit(
      `investor-portal:track:${clientIp}`
    );
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    // Find the active link
    const [link] = await db
      .select({
        id: investorLinks.id,
        expiresAt: investorLinks.expiresAt,
      })
      .from(investorLinks)
      .where(
        and(eq(investorLinks.token, token), eq(investorLinks.isActive, true))
      )
      .limit(1);

    if (!link || !isInvestorClaimUnexpired(link.expiresAt)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Update duration on the most recent view for this page
    const [latestView] = await db
      .select({ id: investorViews.id })
      .from(investorViews)
      .where(
        and(
          eq(investorViews.investorLinkId, link.id),
          eq(investorViews.pagePath, pagePath)
        )
      )
      .orderBy(desc(investorViews.viewedAt))
      .limit(1);

    if (latestView) {
      await db
        .update(investorViews)
        .set({ durationHintMs })
        .where(eq(investorViews.id, latestView.id));
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    await captureError('Investor track endpoint error', error, {
      context: 'investor_track_duration',
    });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
