import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { WaitlistPublicLanding } from '@/components/features/waitlist/WaitlistPublicLanding';
import { WaitlistSuccessView } from '@/components/features/waitlist/WaitlistSuccessView';
import { MarketingPageContractMarkers } from '@/components/site/MarketingPageContractMarkers';
import { PUBLIC_ENTRY_HREF } from '@/constants/routes';
import { getWaitlistRouteRedirect } from '@/lib/auth/access-route-redirect';
import {
  CanonicalUserState,
  getWaitlistAccess,
  getWaitlistReservedHandle,
  resolveUserState,
} from '@/lib/auth/gate';
import { isPublicSignupClosed } from '@/lib/waitlist/public-signup-gate';
import { isWaitlistGateEnabled } from '@/lib/waitlist/settings';
import { isWaitlistPendingStatus } from '@/lib/waitlist/state-machine';

type WaitlistSearchParams = Record<string, string | string[] | undefined>;

/** /start with the visitor's query (source, intent, utm_*) carried over. */
function buildStartHandoffHref(params: WaitlistSearchParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of [value].flat()) {
      if (item !== undefined) query.append(key, item);
    }
  }
  const search = query.toString();
  return search ? `${PUBLIC_ENTRY_HREF}?${search}` : PUBLIC_ENTRY_HREF;
}

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

/**
 * /waitlist is the waitlist-first public handoff (JOV-5376) and the durable
 * pending receipt (JOV-5001 / JOV-2132).
 *
 * There is one flow, not a separate waitlist and onboarding: unauthenticated
 * visitors hand off to the /start chat, which admits or holds them. Only the
 * PUBLIC_SIGNUP_CLOSED kill switch (which sends anonymous /start back here)
 * keeps the public landing. Pre-receipt authenticated states recover to
 * /start chat. They must not render the retired seven-field questionnaire.
 *
 * WAITLIST_PENDING stays here. A real pending row is the only success
 * condition; missing receipts show a recoverable error rather than sending
 * the user back through the /signup redirect loop (JOV-6533).
 *
 * /start is rewrite-exempt for waitlist users, so recovering to /start does
 * not re-enter the JOV-2161 proxy rewrite loop.
 */
export default async function WaitlistPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<WaitlistSearchParams> }> = {}) {
  // The public route-health runtime intentionally has no database but enables
  // the local E2E auth bypass for other suites. Keep that synthetic actor from
  // turning this anonymous surface into an authenticated /start redirect; it
  // renders the kill-switch landing so route health keeps covering it.
  if (process.env.PUBLIC_NOAUTH_SMOKE === '1') {
    return (
      <WaitlistRouteWithContract>
        <WaitlistPublicLanding signupClosed={isPublicSignupClosed()} />
      </WaitlistRouteWithContract>
    );
  }

  const authResult = await resolveUserState({ createDbUserIfMissing: false });
  const waitlistRedirect = getWaitlistRouteRedirect(authResult.state);
  if (waitlistRedirect) {
    redirect(waitlistRedirect);
  }

  if (authResult.state === CanonicalUserState.UNAUTHENTICATED) {
    if (!isPublicSignupClosed()) {
      redirect(buildStartHandoffHref((await searchParams) ?? {}));
    }
    return (
      <WaitlistRouteWithContract>
        <WaitlistPublicLanding signupClosed={isPublicSignupClosed()} />
      </WaitlistRouteWithContract>
    );
  }

  // JOV-6449: gate-off post-auth must not depend on a waitlist table read.
  // Canonical WAITLIST_PENDING is enough to render the receipt.
  const waitlistGateEnabled = await isWaitlistGateEnabled();
  if (
    authResult.state === CanonicalUserState.WAITLIST_PENDING &&
    !waitlistGateEnabled
  ) {
    return (
      <WaitlistRouteWithContract>
        <WaitlistSuccessView email={authResult.context.email} />
      </WaitlistRouteWithContract>
    );
  }

  const access = authResult.context.email
    ? await getWaitlistAccess(authResult.context.email)
    : null;
  if (access?.entryId && isWaitlistPendingStatus(access.status)) {
    const reservedHandle = await getWaitlistReservedHandle(access.entryId);
    return (
      <WaitlistRouteWithContract>
        <WaitlistSuccessView
          email={authResult.context.email}
          reservedHandle={reservedHandle}
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
