import { getSessionCookie } from 'better-auth/cookies';
import type { NextFetchEvent, NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { HOSTNAME } from '@/constants/domains';
import {
  releaseInvestorViewDedup,
  shouldRecordInvestorView,
} from '@/lib/auth/investor-view-dedup';
import {
  isTestAuthBypassEnabled,
  resolveTestBypassUserId,
} from '@/lib/auth/test-mode';
import { captureError } from '@/lib/error-tracking';
import {
  isInvestorClaimTokenShape,
  isInvestorClaimUnexpired,
} from '@/lib/investors/claim-token';
import { investorPortalTokenLimiter } from '@/lib/rate-limit';
import { analyzeHost } from '@/lib/routing/proxy-routing';

const INVESTOR_TOKEN_COOKIE = '__investor_token';
const INVESTOR_TOKEN_PARAM = 't';
const INVESTOR_PORTAL_PATH = '/investor-portal';

/**
 * Former public investor surfaces. The brief, deck and memos now live only
 * under /investor-portal; these answer a neutral, non-indexable 404 for
 * everyone (they also stay reserved so no profile handle can take them).
 */
const RETIRED_INVESTOR_PATHS = ['/investors', '/pitch'] as const;
const RETIRED_INVESTOR_FILES = new Set(['/Jovie-Pitch-Deck.pdf']);

const PRIVATE_HEADERS = {
  'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
  'Cache-Control': 'private, no-store',
} as const;

function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isRetiredInvestorPath(pathname: string): boolean {
  return (
    RETIRED_INVESTOR_FILES.has(pathname) ||
    RETIRED_INVESTOR_PATHS.some(prefix => matchesPathPrefix(pathname, prefix))
  );
}

function withPrivateHeaders<T extends NextResponse>(res: T): T {
  for (const [key, value] of Object.entries(PRIVATE_HEADERS)) {
    res.headers.set(key, value);
  }
  return res;
}

/** Neutral 404: identical for unknown, unauthorized and retired paths. */
function investorNotFound(): NextResponse {
  return withPrivateHeaders(new NextResponse(null, { status: 404 }));
}

/**
 * IP-bucketed throttle on token validation attempts. Runs before any DB
 * lookup so a flood of guessed tokens cannot turn Postgres into the oracle.
 * Returns a 429 response when over limit, null when the attempt may proceed.
 */
async function investorTokenRateLimit(
  req: NextRequest
): Promise<NextResponse | null> {
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const result = await investorPortalTokenLimiter.limit(
    `investor-portal:token:${clientIp}`
  );
  if (result.success) return null;

  return new NextResponse(null, {
    status: 429,
    headers: {
      ...PRIVATE_HEADERS,
      'Retry-After': String(
        Math.max(1, Math.ceil((result.reset.getTime() - Date.now()) / 1000))
      ),
    },
  });
}

function hasSignedInSession(req: NextRequest): boolean {
  if (
    isTestAuthBypassEnabled() &&
    resolveTestBypassUserId(req.headers, req.cookies)
  ) {
    return true;
  }
  try {
    return Boolean(getSessionCookie(req));
  } catch {
    // getSessionCookie can throw on malformed cookies; treat as signed-out.
    return false;
  }
}

/**
 * Handle investor portal requests.
 *
 * 1. Legacy subdomain (investors.jov.ie) → 301 redirect to /investor-portal
 * 2. Retired public /investors, /pitch and deck URLs → neutral 404
 * 3. /investor-portal?t=TOKEN → validate, set cookie, strip param
 * 4. /investor-portal with cookie → validate, record view, continue
 * 5. /investor-portal with only a session → continue; the portal's server
 *    gate admits admins and 404s everyone else
 * 6. anything else under /investor-portal → neutral 404
 *
 * Every response on these paths is noindex and private, no-store.
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
  const isResponseActionPath = pathname === '/investor-portal/respond';

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

  if (isRetiredInvestorPath(pathname)) {
    return investorNotFound();
  }

  // --- Path-based investor portal ---
  if (!matchesPathPrefix(pathname, INVESTOR_PORTAL_PATH)) {
    return null;
  }

  // Check for token in URL param (first visit from shared link)
  const tokenParam = req.nextUrl.searchParams.get(INVESTOR_TOKEN_PARAM);

  if (tokenParam) {
    // Response links consume the token and action together in the page handler.
    // Stripping ?t= here turns valid email links into 404s, and falling
    // through to Clerk would make token-only links depend on session state.
    if (isResponseActionPath) {
      return withPrivateHeaders(NextResponse.next());
    }

    // Rate limit token validation to prevent brute-force enumeration.
    // Shape-check first so malformed tokens cost nothing; the dedicated
    // per-IP bucket then bounds DB-backed guessing to 30 attempts/minute.
    if (!isInvestorClaimTokenShape(tokenParam)) {
      return investorNotFound();
    }
    const limited = await investorTokenRateLimit(req);
    if (limited) return limited;

    const isValid = await validateInvestorToken(tokenParam);
    if (!isValid) {
      return investorNotFound();
    }

    // Valid token: set cookie and redirect to strip ?t= from URL
    const cleanUrl = req.nextUrl.clone();
    cleanUrl.searchParams.delete(INVESTOR_TOKEN_PARAM);

    const res = withPrivateHeaders(NextResponse.redirect(cleanUrl));
    res.cookies.set(INVESTOR_TOKEN_COOKIE, tokenParam, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: INVESTOR_PORTAL_PATH,
    });

    return res;
  }

  // Check for token in cookie (return visits). Cookie tokens are the same
  // brute-force surface as ?t= params, so shape-check and rate-limit them
  // before the DB lookup too.
  const tokenCookie = req.cookies.get(INVESTOR_TOKEN_COOKIE)?.value;
  if (tokenCookie && isInvestorClaimTokenShape(tokenCookie)) {
    const limited = await investorTokenRateLimit(req);
    if (limited) return limited;
  }
  const isValid = tokenCookie
    ? await validateInvestorToken(tokenCookie)
    : false;

  if (!tokenCookie || !isValid) {
    // A signed-in visitor may be an admin. The proxy hot path is cookie-only,
    // so the role check belongs to the portal's server gate, which renders
    // the same neutral 404 for non-admins.
    const res = hasSignedInSession(req)
      ? withPrivateHeaders(NextResponse.next())
      : investorNotFound();
    if (tokenCookie) res.cookies.delete(INVESTOR_TOKEN_COOKIE);
    return res;
  }

  // Anti-scraping headers
  const res = withPrivateHeaders(NextResponse.next());

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
  if (!isInvestorClaimTokenShape(token)) return false;

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

    if (!link || !link.isActive) return false;
    return isInvestorClaimUnexpired(link.expiresAt);
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
