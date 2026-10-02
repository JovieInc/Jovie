import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { hasBetterAuthSessionCookie } from '@/lib/auth/auth-session-cookies';
import { extractBearerToken, verifyCronRequest } from '@/lib/cron/auth';
import { RETRY_AFTER_HEALTH } from '@/lib/http/headers';

// Vary stays off the shared `/api/health/:path*` block so build-info and redis
// keep their current CDN headers.
export const HEALTH_DETAIL_HEADERS = {
  'Cache-Control': 'private, no-store',
  Vary: 'Authorization, Cookie',
} as const;

/** Cron bearer or admin session. Rejected callers and auth failures stay on liveness. */
export async function canReadHealthDetail(
  request: Request,
  route: string
): Promise<boolean> {
  try {
    const bearer = extractBearerToken(request.headers.get('authorization'));
    if (bearer) {
      const cronError = verifyCronRequest(request, { route });
      if (cronError === null) return true;
    }

    const cookieHeader = request.headers.get('cookie') ?? '';
    if (!hasBetterAuthSessionCookie(cookieHeader)) return false;

    const adminError = await requireAdmin();
    return adminError === null;
  } catch {
    return false;
  }
}

export function withHealthDetailHeaders(
  extra?: HeadersInit
): Record<string, string> {
  return {
    ...(extra ? Object.fromEntries(new Headers(extra).entries()) : {}),
    ...HEALTH_DETAIL_HEADERS,
  };
}

export function publicHealthLiveness(
  healthy: boolean,
  extraHeaders?: HeadersInit
): NextResponse {
  return NextResponse.json(
    { healthy, timestamp: new Date().toISOString() },
    {
      status: healthy ? 200 : 503,
      headers: {
        ...withHealthDetailHeaders(extraHeaders),
        ...(healthy ? {} : { 'Retry-After': RETRY_AFTER_HEALTH }),
      },
    }
  );
}
