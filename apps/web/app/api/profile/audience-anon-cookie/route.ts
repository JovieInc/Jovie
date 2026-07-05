import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { AUDIENCE_ANON_COOKIE } from '@/constants/app';
import { DEFAULT_PROFILE_PAC_ASSIGNMENT } from '@/lib/flags/profile-pac';
import {
  getProfileAlertOptInVariant,
  getProfilePacAssignment,
} from '@/lib/flags/server';

/**
 * Thin GET route that reads the httpOnly jv_aid cookie and returns the
 * per-user Statsig profile variants.
 *
 * Called from the AnonCookieBootstrap client component so the public profile
 * route can be ISR-cached (no cookies() in the RSC tree) while still
 * delivering the correct A/B test variants to real visitors on the client side.
 *
 * No auth required — this is a public, anonymous endpoint.
 * Cache-Control: no-store so each real visitor gets their own variant.
 */
export async function GET(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const stableId = cookieStore.get(AUDIENCE_ANON_COOKIE)?.value ?? null;

  // Best-effort: fall back to the default variant if Statsig is unavailable.
  // The client component already handles null/missing responses gracefully.
  const [alertOptInResult, profilePacResult] = await Promise.allSettled([
    getProfileAlertOptInVariant(stableId),
    getProfilePacAssignment(stableId),
  ]);
  const alertOptInVariant =
    alertOptInResult.status === 'fulfilled' ? alertOptInResult.value : 'button';
  const profilePac =
    profilePacResult.status === 'fulfilled'
      ? profilePacResult.value
      : DEFAULT_PROFILE_PAC_ASSIGNMENT;

  return NextResponse.json(
    { alertOptInVariant, profilePac },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}
