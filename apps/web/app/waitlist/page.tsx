import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { WaitlistPublicLanding } from '@/components/features/waitlist/WaitlistPublicLanding';
import { WaitlistSuccessView } from '@/components/features/waitlist/WaitlistSuccessView';
import { MarketingPageContractMarkers } from '@/components/site/MarketingPageContractMarkers';
import { APP_ROUTES } from '@/constants/routes';
import { getWaitlistRouteRedirect } from '@/lib/auth/access-route-redirect';
import { buildProtectedAuthRedirectUrl } from '@/lib/auth/build-auth-route-url';
import {
  CanonicalUserState,
  getWaitlistAccess,
  getWaitlistReservedHandle,
  resolveUserState,
} from '@/lib/auth/gate';
import { PRICING } from '@/lib/config/pricing';
import {
  resolveStartEntryHandoff,
  type StartEntryHandoff,
} from '@/lib/onboarding/start-entry-handoff';
import type { StartEntryProfile } from '@/lib/onboarding/start-entry-profile';
import { resolveStartEntryProfile } from '@/lib/onboarding/start-entry-profile.server';
import { isWaitlistPendingStatus } from '@/lib/waitlist/state-machine';

function WaitlistRouteWithContract({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <>
      <MarketingPageContractMarkers />
      {children}
    </>
  );
}

function buildWaitlistEntrySearch({
  entryProfile,
  intentId,
  starterHandoff,
}: Readonly<{
  entryProfile: StartEntryProfile | null;
  intentId?: string;
  starterHandoff: StartEntryHandoff | null;
}>): string {
  const search = new URLSearchParams();
  if (intentId) search.set('intent_id', intentId);
  if (starterHandoff) {
    search.set('starter_prompt', starterHandoff.prompt);
    if (starterHandoff.spotifyUrl) {
      search.set('spotify_url', starterHandoff.spotifyUrl);
    }
    if (starterHandoff.artistName) {
      search.set('artist_name', starterHandoff.artistName);
    }
  } else if (entryProfile) {
    search.set('handle', entryProfile.handle);
  }
  const value = search.toString();
  return value ? `?${value}` : '';
}

function renderPublicEntry({
  entryProfile,
  intentId,
  starterHandoff,
}: Readonly<{
  entryProfile: StartEntryProfile | null;
  intentId?: string;
  starterHandoff: StartEntryHandoff | null;
}>) {
  const entrySearch = buildWaitlistEntrySearch({
    entryProfile,
    intentId,
    starterHandoff,
  });
  return (
    <WaitlistRouteWithContract>
      <WaitlistPublicLanding
        entryProfile={entryProfile}
        intentId={intentId}
        signInHref={buildProtectedAuthRedirectUrl(
          APP_ROUTES.SIGNIN,
          APP_ROUTES.WAITLIST,
          entrySearch
        )}
        starterHandoff={starterHandoff}
      />
    </WaitlistRouteWithContract>
  );
}

/**
 * /waitlist is the waitlist-first public handoff (JOV-5376) and the durable
 * pending receipt (JOV-5001 / JOV-2132).
 *
 * Unauthenticated visitors get the existing onboarding conversation and
 * draft-profile builder. Pre-receipt authenticated states recover to /start
 * chat. They must not render the retired seven-field waitlist questionnaire.
 *
 * WAITLIST_PENDING stays here. A real pending row is the only success
 * condition; missing receipts show a recoverable error rather than sending
 * the user back through the /signup redirect loop (JOV-6533).
 *
 * /start is rewrite-exempt for waitlist users, so recovering to /start does
 * not re-enter the JOV-2161 proxy rewrite loop.
 */
export default async function WaitlistPage(
  {
    searchParams,
  }: Readonly<{
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  }> = { searchParams: Promise.resolve({}) }
) {
  const params = await searchParams;
  const intentId =
    typeof params.intent_id === 'string' ? params.intent_id : undefined;
  const starterHandoff = resolveStartEntryHandoff(params);

  // The public route-health runtime intentionally has no database but enables
  // the local E2E auth bypass for other suites. Keep that synthetic actor from
  // turning this anonymous surface into an authenticated /start redirect.
  if (process.env.PUBLIC_NOAUTH_SMOKE === '1') {
    return renderPublicEntry({
      entryProfile: null,
      intentId,
      starterHandoff,
    });
  }

  const authResult = await resolveUserState({ createDbUserIfMissing: false });
  const waitlistRedirect = getWaitlistRouteRedirect(authResult.state);
  if (waitlistRedirect) {
    redirect(waitlistRedirect);
  }

  if (authResult.state === CanonicalUserState.UNAUTHENTICATED) {
    const entryProfile =
      starterHandoff || intentId
        ? null
        : await resolveStartEntryProfile(params);
    return renderPublicEntry({ entryProfile, intentId, starterHandoff });
  }

  // Anyone signed in can buy the self-serve Pro offer while waiting; a
  // verified payment admits them (JOV-7701 founder decision, 2026-10-03).
  const proCheckoutPriceId = PRICING.pro.monthly.priceId || null;

  const access = authResult.context.email
    ? await getWaitlistAccess(authResult.context.email)
    : null;
  if (access?.entryId && isWaitlistPendingStatus(access.status)) {
    const reservedHandle = await getWaitlistReservedHandle(access.entryId);
    return (
      <WaitlistRouteWithContract>
        <WaitlistSuccessView
          email={authResult.context.email}
          outcome={
            access.statusReason === 'waitlist_capacity_full'
              ? 'waitlisted_capacity_full'
              : 'pending'
          }
          reservedHandle={reservedHandle}
          proCheckoutPriceId={proCheckoutPriceId}
        />
      </WaitlistRouteWithContract>
    );
  }

  // A stale pending status must not claim success or bounce a signed-in user
  // through /signup -> /waitlist indefinitely.
  return (
    <WaitlistRouteWithContract>
      <WaitlistSuccessView
        outcome='receipt_unavailable'
        email={authResult.context.email}
      />
    </WaitlistRouteWithContract>
  );
}
