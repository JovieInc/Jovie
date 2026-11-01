import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { investorLinks, investorViews } from '@/lib/db/schema/investors';
import { captureError } from '@/lib/error-tracking';
import {
  isInvestorClaimTokenShape,
  isInvestorClaimUnexpired,
} from '@/lib/investors/claim-token';
import { buildInvestorEventPath } from '@/lib/investors/portal-events';
import { investorPortalTokenLimiter } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const PRIVATE_HEADERS = {
  'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
  'Cache-Control': 'private, no-store',
} as const;

const RESPONSE_ACTIONS = ['interested', 'pass'];

/**
 * POST /api/investors/respond — the only mutating step of the investor
 * response flow (JOV-8888).
 *
 * The GET page at /investor-portal/respond is a read-only confirmation step:
 * mail security scanners routinely prefetch email links, so a stage change
 * may never ride a GET render. This handler consumes the same token from the
 * confirmation form and applies the exact stage semantics the page used to
 * apply inline:
 *
 * - interested: only shared/viewed links advance to engaged (+ call_requested
 *   view row); replaying the POST on an engaged/passed link is a no-op
 * - pass: marks the link passed unconditionally
 *
 * Abuse cap: per-IP token limiter (30/min, fail-closed without Redis) — the
 * same fail-closed posture as the portal's token-validation limiter.
 */
export async function POST(request: Request) {
  let token = '';
  let action = '';

  try {
    const form = await request.formData();
    token = String(form.get('token') ?? '');
    action = String(form.get('action') ?? '');
  } catch {
    return new NextResponse(null, { status: 400, headers: PRIVATE_HEADERS });
  }

  if (!RESPONSE_ACTIONS.includes(action)) {
    return new NextResponse(null, { status: 404, headers: PRIVATE_HEADERS });
  }

  // Shape-check first so malformed tokens cost nothing (mirrors the proxy's
  // token path); the per-IP bucket bounds DB-backed token guessing.
  if (!isInvestorClaimTokenShape(token)) {
    return new NextResponse(null, { status: 404, headers: PRIVATE_HEADERS });
  }

  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rateLimit = await investorPortalTokenLimiter.limit(
    `investor-portal:respond:${clientIp}`
  );
  if (!rateLimit.success) {
    return new NextResponse(null, { status: 429, headers: PRIVATE_HEADERS });
  }

  try {
    const now = new Date();
    const [link] = await db
      .select({
        id: investorLinks.id,
        stage: investorLinks.stage,
        expiresAt: investorLinks.expiresAt,
      })
      .from(investorLinks)
      .where(
        and(eq(investorLinks.token, token), eq(investorLinks.isActive, true))
      )
      .limit(1);

    if (!link || !isInvestorClaimUnexpired(link.expiresAt, now)) {
      return new NextResponse(null, {
        status: 404,
        headers: PRIVATE_HEADERS,
      });
    }

    if (action === 'interested') {
      const advanceableStages = ['shared', 'viewed'];
      if (advanceableStages.includes(link.stage)) {
        await db
          .update(investorLinks)
          .set({ stage: 'engaged', updatedAt: now })
          .where(eq(investorLinks.id, link.id));
        await db.insert(investorViews).values({
          investorLinkId: link.id,
          pagePath: buildInvestorEventPath('call_requested'),
        });
      }
    } else {
      await db
        .update(investorLinks)
        .set({ stage: 'passed', updatedAt: now })
        .where(eq(investorLinks.id, link.id));
    }
  } catch (error) {
    await captureError('Investor respond mutation failed', error, {
      context: 'investor_respond',
    });
    return new NextResponse(null, { status: 500, headers: PRIVATE_HEADERS });
  }

  // Back to the read-only response page, which renders the matching
  // thank-you screen. 303 forces the follow-up navigation to be a GET.
  const resultUrl = new URL('/investor-portal/respond', request.url);
  resultUrl.searchParams.set('t', token);
  resultUrl.searchParams.set('action', action);
  resultUrl.searchParams.set('confirmed', '1');
  return NextResponse.redirect(resultUrl, {
    status: 303,
    headers: PRIVATE_HEADERS,
  });
}
