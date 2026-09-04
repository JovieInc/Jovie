'use client';

import { useEffect } from 'react';
import { AuthenticatedAuthEntryGuard } from '@/components/features/auth/AuthenticatedAuthEntryGuard';
import { APP_ROUTES } from '@/constants/routes';
import {
  WAITLIST_FRONT_DOOR_CONTEXT,
  WAITLIST_FRONT_DOOR_EVENTS,
} from '@/data/homepageFrontDoorCta';
import { AuthLayout, AuthRoutePrefetch, AuthShell } from '@/features/auth';
import { page, track } from '@/lib/analytics';

/**
 * Unauthenticated /waitlist handoff (JOV-5334 / JOV-5376).
 *
 * Splash B chrome: centered 32 mark, empty field, sign-up shell.
 * Get started on marketing pages lands here instead of unfinished /start chat.
 * Auth completion continues into /start.
 */
export function WaitlistPublicLanding() {
  useEffect(() => {
    page('waitlist', WAITLIST_FRONT_DOOR_CONTEXT);
    track(WAITLIST_FRONT_DOOR_EVENTS.PAGE_VIEW, WAITLIST_FRONT_DOOR_CONTEXT);
    track(WAITLIST_FRONT_DOOR_EVENTS.CTA_EXPOSED, WAITLIST_FRONT_DOOR_CONTEXT);
  }, []);

  return (
    <AuthenticatedAuthEntryGuard>
      <AuthLayout
        formTitle='Get started'
        showFormTitle={false}
        showFooterPrompt={false}
        layoutVariant='stack'
        chrome='splash-b'
      >
        <AuthRoutePrefetch href={APP_ROUTES.SIGNIN} />
        <AuthShell
          mode='sign-up'
          forceOppositeModeHardNavigation
          oppositeModeUrl={APP_ROUTES.SIGNIN}
          fallbackRedirectUrl={APP_ROUTES.START}
          suppressOneTap
        />
      </AuthLayout>
    </AuthenticatedAuthEntryGuard>
  );
}
