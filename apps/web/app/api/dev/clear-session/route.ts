import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { CLERK_COOKIE_PREFIXES } from '@/lib/auth/clerk-cookie-names';
import { DEV_TEST_AUTH_COOKIE_NAMES } from '@/lib/auth/dev-test-auth.server';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/** Explicit app cookies to delete */
const APP_COOKIES = new Set([
  'jv_cc',
  'jv_cc_required',
  'jv_city',
  'jv_region',
  'jv_country',
  'jv_aid',
  'jv_identified',
  'jovie_onboarding_complete',
  'jovie_redirect_count',
  'jovie_impersonate',
  'jovie_dsp',
  '__investor_token',
  ...DEV_TEST_AUTH_COOKIE_NAMES,
]);

/** Cookies to preserve (gates toolbar visibility in production) */
const PRESERVE_PREFIXES = ['__dev_toolbar'];

export async function POST() {
  const isProductionEnv =
    process.env.NODE_ENV === 'production' &&
    process.env.VERCEL_ENV === 'production';

  if (isProductionEnv) {
    return NextResponse.json(
      { success: false, error: 'Not available in production' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  const deleted: string[] = [];

  for (const cookie of allCookies) {
    const { name } = cookie;

    // Skip preserved cookies
    if (PRESERVE_PREFIXES.some(p => name.startsWith(p))) continue;

    const isClerkCookie = CLERK_COOKIE_PREFIXES.some(p => name.startsWith(p));
    const isAppCookie = APP_COOKIES.has(name);

    if (isClerkCookie || isAppCookie) {
      cookieStore.delete(name);
      deleted.push(name);
    }
  }

  return NextResponse.json(
    { success: true, deleted },
    { status: 200, headers: NO_STORE_HEADERS }
  );
}
