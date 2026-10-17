'use client';

import { useEffect } from 'react';
import { OnboardingSessionBoundary } from '@/components/features/onboarding/OnboardingSessionBoundary';
import { APP_ROUTES } from '@/constants/routes';
import {
  WAITLIST_FRONT_DOOR_CONTEXT,
  WAITLIST_FRONT_DOOR_EVENTS,
} from '@/data/homepageFrontDoorCta';
import { page, track } from '@/lib/analytics';
import type { StartEntryHandoff } from '@/lib/onboarding/start-entry-handoff';
import type { StartEntryProfile } from '@/lib/onboarding/start-entry-profile';

/**
 * Unauthenticated /waitlist handoff (JOV-5334 / JOV-5376).
 *
 * Reuses the signed anonymous onboarding session. The first useful message
 * mints the conversation; verified sign-in later claims that exact transcript.
 */
export function WaitlistPublicLanding({
  entryProfile = null,
  intentId,
  signInHref = APP_ROUTES.SIGNIN,
  starterHandoff = null,
}: Readonly<{
  entryProfile?: StartEntryProfile | null;
  intentId?: string;
  signInHref?: string;
  starterHandoff?: StartEntryHandoff | null;
}>) {
  useEffect(() => {
    page('waitlist', WAITLIST_FRONT_DOOR_CONTEXT);
    track(WAITLIST_FRONT_DOOR_EVENTS.PAGE_VIEW, WAITLIST_FRONT_DOOR_CONTEXT);
    track(WAITLIST_FRONT_DOOR_EVENTS.CTA_EXPOSED, WAITLIST_FRONT_DOOR_CONTEXT);
  }, []);

  return (
    <OnboardingSessionBoundary
      entryProfile={entryProfile}
      entrySurface='waitlist'
      intentId={intentId}
      sessionLabel='pending'
      signInHref={signInHref}
      starterHandoff={starterHandoff}
    />
  );
}
