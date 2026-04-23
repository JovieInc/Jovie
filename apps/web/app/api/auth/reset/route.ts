import { type NextRequest, NextResponse } from 'next/server';
import { CLERK_COOKIE_PREFIXES } from '@/lib/auth/clerk-cookie-names';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

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
 * Public cookie-clear endpoint. Deletes Clerk auth cookies on both the current
 * host and the parent `.jov.ie` scope, then redirects to `/signin?reset=1` so
 * the signin page can surface a confirmation toast.
 *
 * Safe to expose without auth: this only deletes the caller's own cookies.
 * Used by the signin-page timeout escape and the Clerk-unavailable notice
 * when cross-environment cookie collisions break auth.
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

  // Use headers.append instead of response.cookies.set so cookies with the same
  // name but different Domain attributes both land in Set-Cookie. The Next
  // cookies helper dedupes by name and collapses host-scoped + parent-scoped
  // deletes into a single header, which leaves the parent-scoped cookie alive.
  for (const { name } of incomingCookies) {
    const isClerkCookie = CLERK_COOKIE_PREFIXES.some(p => name.startsWith(p));
    if (!isClerkCookie) continue;

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
