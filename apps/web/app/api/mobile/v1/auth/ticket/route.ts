import { NextResponse } from 'next/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

/**
 * Deprecated compatibility endpoint.
 *
 * The centralized native auth flow returns only a one-time exchange code in
 * app callbacks, then creates Clerk sign-in tickets over HTTPS from
 * `/api/auth/native/exchange`. This endpoint intentionally no longer mints
 * tickets into deep links.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'Deprecated auth ticket route',
      replacement: '/auth/start?client=ios',
    },
    { status: 410, headers: NO_STORE_HEADERS }
  );
}
