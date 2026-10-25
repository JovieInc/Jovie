import { type NextRequest, NextResponse } from 'next/server';
import { isLegacyProfileModeAlias } from '@/app/[username]/_lib/mode-route-redirect';

/**
 * Edge-side fast path for legacy profile-mode aliases
 * (`/<username>/listen|music|releases|subscribe|tip|tour|shows|events`).
 *
 * Every alias hop historically invoked the ISR'd catch-all resolver function
 * in the deployment region even on an `x-vercel-cache: HIT`, and that
 * invocation intermittently costs 500-700ms on cold instances — which broke
 * the staged canonical navigation alias budgets. This helper instead asks the
 * CDN-cacheable decision endpoint (`/api/profile-alias-decision`) and emits
 * the exact same 307/308 from the middleware. Fail-open contract: ANY
 * uncertainty (non-2xx, timeout, malformed body, content collision, unknown
 * creator) returns `null` and the request falls through to the afterFiles
 * rewrite + catch-all resolver page, which owns the byte-for-byte historical
 * behavior.
 */

const PROFILE_ALIAS_DECISION_BUDGET_MS = 250;
// A cold decision lambda on a fresh staged deployment often needs longer
// than the response budget. Aborting the subrequest at that budget cancelled
// the origin response before the CDN could store it, so /listen (the first
// alias the gate measures) repeated the miss. The budget still decides
// whether THIS navigation uses the fast path; the in-flight fetch is allowed
// to finish so the next sample is a CDN hit.
const PROFILE_ALIAS_DECISION_CACHE_FILL_MS = 3_000;

interface AliasDecisionPayload {
  readonly href?: unknown;
  readonly kind?: unknown;
}

export function buildProfileAliasDecisionUrl(
  req: NextRequest,
  username: string,
  aliasSlug: string
): URL | null {
  if (!username || !isLegacyProfileModeAlias(aliasSlug)) return null;

  const sourceParam = req.nextUrl.searchParams.get('source');
  const source =
    sourceParam === 'link' || sourceParam === 'qr' ? sourceParam : undefined;

  const decisionUrl = new URL(
    '/api/profile-alias-decision',
    req.nextUrl.origin
  );
  decisionUrl.searchParams.set('username', username.toLowerCase());
  decisionUrl.searchParams.set('alias', aliasSlug);
  if (source) decisionUrl.searchParams.set('source', source);
  return decisionUrl;
}

function budgetDecisionFetch<T>(pending: Promise<T>): Promise<T | null> {
  return new Promise(resolve => {
    const timer = setTimeout(
      () => resolve(null),
      PROFILE_ALIAS_DECISION_BUDGET_MS
    );
    pending.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      }
    );
  });
}

function aliasDecisionResponse(
  req: NextRequest,
  href: string,
  status: 307 | 308
): NextResponse {
  // The decision href is always a root-relative path produced by
  // resolveProfileModeAliasDecision; re-resolving against the request origin
  // keeps the redirect same-origin and preserves the historical Location.
  return NextResponse.redirect(new URL(href, req.nextUrl.origin), status);
}

export async function resolveProfileModeAliasAtEdge(
  req: NextRequest,
  username: string,
  aliasSlug: string,
  waitUntil?: (promise: Promise<unknown>) => void
): Promise<NextResponse | null> {
  // Tests and local dev exercise the resolver page directly (matching the
  // page's own test/dev cache-bypass policy); the fast path is a hosted-
  // deployment optimization only.
  if (
    process.env.NODE_ENV === 'test' ||
    process.env.NODE_ENV === 'development'
  ) {
    return null;
  }

  const decisionUrl = buildProfileAliasDecisionUrl(req, username, aliasSlug);
  if (!decisionUrl) return null;

  let payload: AliasDecisionPayload | null = null;
  try {
    const pending = fetch(decisionUrl, {
      // Forward the visitor cookie header so protected deployments (Vercel
      // deployment protection + bypass cookie) can resolve the decision; the
      // endpoint is public, visitor-independent, and reads no cookies.
      headers: req.headers.get('cookie')
        ? { cookie: req.headers.get('cookie') as string }
        : undefined,
      // Longer than the response budget on purpose. See
      // PROFILE_ALIAS_DECISION_CACHE_FILL_MS.
      signal: AbortSignal.timeout(PROFILE_ALIAS_DECISION_CACHE_FILL_MS),
    }).then(async response => {
      const body = await response.text();
      return { body, response };
    });
    const outcome = await budgetDecisionFetch(pending);
    if (!outcome) {
      waitUntil?.(pending.then(() => undefined).catch(() => undefined));
      return null;
    }
    if (!outcome.response.ok) return null;
    payload = JSON.parse(outcome.body) as AliasDecisionPayload;
  } catch {
    // Network failure or malformed body — the resolver page owns the request.
    return null;
  }

  if (!payload || typeof payload !== 'object') return null;
  const { href, kind } = payload;
  if (
    typeof href !== 'string' ||
    // Reject protocol-relative hrefs ('//host') as defense-in-depth; the
    // endpoint only ever produces root-relative paths.
    !href.startsWith('/') ||
    href.startsWith('//')
  ) {
    return null;
  }

  if (kind === 'mode') return aliasDecisionResponse(req, href, 307);
  if (kind === 'moved') return aliasDecisionResponse(req, href, 308);
  // 'content' collisions, 'missing' creators, and unknown kinds fall through.
  return null;
}
