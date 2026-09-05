import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/roles';
import { getAppUserByBetterAuthId } from '@/lib/auth/app-user';
import { auth } from '@/lib/auth/better-auth';
import { buildContentSecurityPolicy } from '@/lib/security/content-security-policy';
import { accessResponse, isPublicEntry } from './lib/access';

export async function proxy(request: NextRequest) {
  if (
    !isPublicEntry(
      request.nextUrl.pathname,
      request.method,
      request.headers.has('next-action')
    )
  ) {
    try {
      const session = await auth.api.getSession({
        headers: request.headers,
        query: { disableCookieCache: true },
      });
      const user = session
        ? await getAppUserByBetterAuthId(session.user.id)
        : null;
      const access = !session
        ? 'anonymous'
        : user && (await isAdmin(user.id))
          ? 'admin'
          : 'forbidden';
      const denied = accessResponse(request, access);
      if (denied) return denied;
    } catch {
      return NextResponse.json(
        { error: 'Ovie authentication unavailable' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    }
  }
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildContentSecurityPolicy({
    nonce,
    isDev: process.env.NODE_ENV === 'development',
  });
  const headers = new Headers(request.headers);
  headers.set('x-ovie-pathname', request.nextUrl.pathname);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

// Route exceptions are evaluated above, including method/action checks.
export const config = { matcher: ['/:path*'] };
