import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { investorLinks, investorViews } from '@/lib/db/schema/investors';
import { captureError } from '@/lib/error-tracking';
import {
  isInvestorClaimTokenShape,
  isInvestorClaimUnexpired,
} from '@/lib/investors/claim-token';

export const runtime = 'nodejs';

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
    const body = await request.json();
    const { token, pagePath, durationHintMs } = body;

    if (!token || !pagePath || !durationHintMs) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    if (!isInvestorClaimTokenShape(token)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
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
