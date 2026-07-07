import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Better Auth cookie name prefixes. Catches suffixed variants like
 * `better-auth.session_token_<suffix>` that Better Auth may emit for
 * chunked cookies. Shared with `/api/dev/clear-session` so both stay in sync.
 *
 * The canonical session cookie is `better-auth.session_token`. The
 * `__Secure-` and `__Host-` prefixes are added on HTTPS origins by Better
 * Auth automatically; we strip them when matching so the delete works on
 * both dev (http) and prod (https) origins.
 */
export const BETTER_AUTH_COOKIE_PREFIXES = [
  'better-auth.',
  '__Secure-better-auth.',
  '__Host-better-auth.',
] as const;

export function isBetterAuthCookieName(name: string): boolean {
  return BETTER_AUTH_COOKIE_PREFIXES.some(prefix => name.startsWith(prefix));
}

/**
 * Derive the parent cookie scope (e.g. `.jov.ie` for `staging.jov.ie`) so
 * we can delete cookies set on the parent domain by a sibling environment.
 * Returns null for apex hostnames and localhost — nothing to strip.
 */
function parentDomainScope(hostname: string): string | null {
  if (!hostname || hostname === 'localhost') return null;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return null;

  const parts = hostname.split('.');
  if (parts.length < 3) return null;

  return `.${parts.slice(-2).join('.')}`;
}

/**
 * Public cookie-clear endpoint (Clerk → Better Auth migration, client-flip
 * commit ⑦). Deletes Better Auth session cookies on both the current host
 * and the parent `.jov.ie` scope, then redirects to `/signin?reset=1` so the
 * signin page can surface a confirmation toast (plan design row 23: cutover
 * bounce reuses the `?reset=1` session-cleared toast).
 *
 * Plan design row 21: rewrote from Clerk cookie clearing to Better Auth
 * cookie clearing. Safe to expose without auth: this only deletes the
 * caller's own cookies.
 */
async function handleReset(req: NextRequest): Promise<NextResponse> {
  const hostname = req.nextUrl.hostname;
  const parentScope = parentDomainScope(hostname);
  const response = NextResponse.redirect(
    new URL('/signin?reset=1', req.url),
    303
  );
  response.headers.set('Cache-Control', 'no-store');

  const incomingCookies = req.cookies.getAll();

  // Use headers.append instead of response.cookies.set so cookies with the
  // same name but different Domain attributes both land in Set-Cookie. The
  // Next cookies helper dedupes by name and collapses host-scoped +
  // parent-scoped deletes into a single header, which leaves the
  // parent-scoped cookie alive.
  for (const { name } of incomingCookies) {
    if (!isBetterAuthCookieName(name)) continue;

    response.headers.append(
      'set-cookie',
      `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
    );

    if (parentScope) {
      response.headers.append(
        'set-cookie',
        `${name}=; Path=/; Domain=${parentScope}; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
      );
    }
  }

  return response;
}

export async function POST(req: NextRequest) {
  return handleReset(req);
}

export async function GET(req: NextRequest) {
  return handleReset(req);
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: 'GET, POST, OPTIONS',
      ...NO_STORE_HEADERS,
    },
  });
}
