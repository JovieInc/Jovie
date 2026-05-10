import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { AUDIENCE_ANON_COOKIE } from '@/constants/app';
import { getProfileAlertOptInVariant } from '@/lib/flags/server';

/**
 * Thin GET route that reads the httpOnly jv_aid cookie and returns the
 * per-user Statsig alertOptInVariant.
 *
 * Called from the AnonCookieBootstrap client component so the public profile
 * route can be ISR-cached (no cookies() in the RSC tree) while still
 * delivering the correct A/B test variant to real visitors on the client side.
 *
 * No auth required — this is a public, anonymous endpoint.
 * Cache-Control: no-store so each real visitor gets their own variant.
 */
export async function GET(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const stableId = cookieStore.get(AUDIENCE_ANON_COOKIE)?.value ?? null;

  // Best-effort: fall back to the default variant if Statsig is unavailable.
  // The client component already handles null/missing responses gracefully.
  let alertOptInVariant: Awaited<
    ReturnType<typeof getProfileAlertOptInVariant>
  >;
  try {
    alertOptInVariant = await getProfileAlertOptInVariant(stableId);
  } catch {
    alertOptInVariant = 'button';
  }

  return NextResponse.json(
    { alertOptInVariant },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}
