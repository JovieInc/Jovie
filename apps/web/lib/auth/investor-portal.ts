import type { NextFetchEvent, NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { HOSTNAME } from '@/constants/domains';
import {
  releaseInvestorViewDedup,
  shouldRecordInvestorView,
} from '@/lib/auth/investor-view-dedup';
import { captureError } from '@/lib/error-tracking';
import { analyzeHost } from '@/lib/routing/proxy-routing';

const INVESTOR_TOKEN_COOKIE = '__investor_token';
const INVESTOR_TOKEN_PARAM = 't';

/**
 * Handle investor portal requests.
 *
 * 1. Legacy subdomain (investors.jov.ie) → 301 redirect to /investor-portal
 * 2. /investor-portal?t=TOKEN → validate, set cookie, strip param
 * 3. /investor-portal with cookie → validate, record view, continue
 *
 * Extracted to dedicated helper so auth routing no longer shares a file
 * with token-gated investor access.
 */
export async function handleInvestorRequest(
  req: NextRequest,
  event?: NextFetchEvent
): Promise<NextResponse | null> {
  const hostname = req.nextUrl.hostname;
  const hostInfo = analyzeHost(hostname);
  const pathname = req.nextUrl.pathname;

  // --- Legacy subdomain redirect ---
  if (hostInfo.isInvestorPortal) {
    // Allow Next.js internals and static files to pass through
    if (
      pathname.startsWith('/_next') ||
      pathname.startsWith('/favicon') ||
      pathname.endsWith('.ico') ||
      pathname.endsWith('.png') ||
      pathname.endsWith('.jpg') ||
      pathname.endsWith('.svg')
    ) {
      return NextResponse.next();
    }

    // Redirect to main host /investor-portal, preserving token param
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.hostname = HOSTNAME;
    redirectUrl.port = '';
    const subPath = pathname === '/' ? '' : pathname;
    redirectUrl.pathname = `/investor-portal${subPath}`;

    return NextResponse.redirect(redirectUrl, 301);
  }

  // --- Path-based investor portal ---
  if (
    !pathname.startsWith('/investor-portal') ||
    pathname.startsWith('/_next')
  ) {
    return null;
  }

  // Check for token in URL param (first visit from shared link)
  const tokenParam = req.nextUrl.searchParams.get(INVESTOR_TOKEN_PARAM);

  if (tokenParam) {
    const isValid = await validateInvestorToken(tokenParam);
    if (!isValid) {
      return new NextResponse(null, { status: 404 });
    }

    // Valid token: set cookie and redirect to strip ?t= from URL
    const cleanUrl = req.nextUrl.clone();
    cleanUrl.searchParams.delete(INVESTOR_TOKEN_PARAM);

    const res = NextResponse.redirect(cleanUrl);
    res.cookies.set(INVESTOR_TOKEN_COOKIE, tokenParam, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });

    return res;
  }

  // Check for token in cookie (return visits)
  const tokenCookie = req.cookies.get(INVESTOR_TOKEN_COOKIE)?.value;

  if (!tokenCookie) {
    return new NextResponse(null, { status: 404 });
  }

  // Validate cookie token against DB
  const isValid = await validateInvestorToken(tokenCookie);

  if (!isValid) {
    const res = new NextResponse(null, { status: 404 });
    res.cookies.delete(INVESTOR_TOKEN_COOKIE);
    return res;
  }

  const res = NextResponse.next();

  // Anti-scraping headers
  res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  res.headers.set('Cache-Control', 'private, no-store');

  // Record view — use waitUntil for edge runtime reliability
  if (event) {
    event.waitUntil(recordInvestorView(tokenCookie, pathname, req));
  } else {
    await recordInvestorView(tokenCookie, pathname, req);
  }

  return res;
}

/**
 * Validate an investor token against the database.
 * Checks: exists, is_active, not expired.
 * Returns true if valid.
 */
async function validateInvestorToken(token: string): Promise<boolean> {
  try {
    // Lazy import to avoid loading DB in every middleware invocation
    const { db } = await import('@/lib/db');
    const { investorLinks } = await import('@/lib/db/schema/investors');
    const { eq, and } = await import('drizzle-orm');

    const [link] = await db
      .select({
        id: investorLinks.id,
        isActive: investorLinks.isActive,
        expiresAt: investorLinks.expiresAt,
      })
      .from(investorLinks)
      .where(
        and(eq(investorLinks.token, token), eq(investorLinks.isActive, true))
      )
      .limit(1);

    if (!link) return false;

    // Check expiry
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      return false;
    }

    return true;
  } catch (error) {
    // Fail closed: if DB is down, deny access
    await captureError('Investor token validation failed', error, {
      context: 'investor_portal',
    });
    return false;
  }
}

/**
 * Record an investor page view (fire-and-forget).
 * Also updates stage from 'shared' to 'viewed' on first view.
 *
 * Dedup: skips the DB write if the same (token, pagePath) pair was already
 * recorded within the last 5 minutes. Redis-backed; fail-open if Redis is
 * unreachable (records the view rather than dropping it).
 */
async function recordInvestorView(
  token: string,
  pagePath: string,
  req: NextRequest
): Promise<void> {
  try {
    // 5-minute dedup: same investor hitting the same route generates at most
    // one view row per window. visitorKey = token (uniquely identifies the
    // investor link). route = pagePath (already query-string-free — callers
    // pass req.nextUrl.pathname).
    const shouldRecord = await shouldRecordInvestorView({
      visitorKey: token,
      route: pagePath,
    });

    if (!shouldRecord) return;

    // Wrap DB writes so we can release the dedup lock on failure.
    // If the DB write fails and we leave the Redis key set, the view
    // would be silently lost for the remainder of the 5-min window.
    try {
      const { db } = await import('@/lib/db');
      const { investorLinks, investorViews } = await import(
        '@/lib/db/schema/investors'
      );
      const { eq } = await import('drizzle-orm');

      // Find the link
      const [link] = await db
        .select({ id: investorLinks.id, stage: investorLinks.stage })
        .from(investorLinks)
        .where(eq(investorLinks.token, token))
        .limit(1);

      if (!link) return;

      // Insert view record
      await db.insert(investorViews).values({
        investorLinkId: link.id,
        pagePath,
        userAgent: req.headers.get('user-agent') ?? undefined,
        referrer: req.headers.get('referer') ?? undefined,
      });

      // Auto-advance stage: shared → viewed on first view
      if (link.stage === 'shared') {
        await db
          .update(investorLinks)
          .set({ stage: 'viewed', updatedAt: new Date() })
          .where(eq(investorLinks.id, link.id));
      }
    } catch (dbError) {
      // DB write failed after dedup lock was acquired — release the lock
      // so the next request within the 5-min window can retry the write.
      await releaseInvestorViewDedup({ visitorKey: token, route: pagePath });
      throw dbError; // re-throw so the outer catch can log it
    }
  } catch (error) {
    // Swallow errors — view tracking should never block the response
    await captureError('Investor view tracking failed', error, {
      context: 'investor_portal',
      pagePath,
    });
  }
}
